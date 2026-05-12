// Main process entry point. Initialises the database, instantiates the in-process
// pi session manager, wires up the IPC router, and creates the main window.

import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { runBiomeCheck } from "./biome-runner";
import { type BranchAgentSession, BranchService } from "./branch-service";
import { installCrashHandler } from "./crash-handler";
import { getDefaultCwd } from "./default-cwd";
import { electronDialogHandlers } from "./dialog-handlers";
import { ExtensionsService } from "./extensions-service";
import { IpcRouter } from "./ipc-router";
import { createLogger, type Logger } from "./logger";
import { PiSessionManager } from "./pi-session-manager";
import { AppSettingsRepo } from "./repos/app-settings";
import { ChannelSessionsRepo } from "./repos/channel-sessions";
import { ChannelsRepo } from "./repos/channels";
import { SkillsService } from "./skills-service";
import { startupWithRecovery } from "./startup-recovery";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Pin the data + logs directories to the lowercase identifier BEFORE
// changing the display name. Electron derives userData/logs/cache from
// app.name, so renaming to "MacPi" without this would move the DB to a
// new directory and look like data loss on case-sensitive filesystems
// (macOS APFS is case-insensitive by default, so most users wouldn't
// notice, but we shouldn't depend on that).
const appData = app.getPath("appData");
app.setPath("userData", path.join(appData, "macpi"));
if (process.platform === "darwin") {
	app.setPath("logs", path.join(os.homedir(), "Library", "Logs", "macpi"));
}

// Set display name AFTER the path pins so the macOS application menu
// reads "MacPi" (not "Electron") in dev runs. Packaged builds also pick
// this up from package.json productName + forge packagerConfig.name.
app.setName("MacPi");

let piSessionManager: PiSessionManager | null = null;
let router: IpcRouter | null = null;
let mainLogger: Logger | null = null;
let rendererLogger: Logger | null = null;

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		title: "MacPi",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			sandbox: false,
			nodeIntegration: false,
		},
	});
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		void mainWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		);
	}
}

app.whenReady().then(async () => {
	const logsDir = app.getPath("logs");
	mainLogger = createLogger({ dir: logsDir, stream: "main" });
	rendererLogger = createLogger({ dir: logsDir, stream: "renderer" });
	mainLogger.info(`macpi starting; userData=${app.getPath("userData")}`);
	installCrashHandler(mainLogger, logsDir);

	// Dev mode dock icon (macOS only). Packaged apps get their dock icon from
	// the bundle's Info.plist via packagerConfig.icon — no runtime override
	// needed (or wanted: build/icon.png isn't shipped in the asar).
	if (
		MAIN_WINDOW_VITE_DEV_SERVER_URL &&
		process.platform === "darwin" &&
		app.dock
	) {
		const iconPath = path.join(app.getAppPath(), "build", "icon.png");
		app.dock.setIcon(iconPath);
	}

	const dbPath = path.join(app.getPath("userData"), "macpi.db");
	process.env.MACPI_MIGRATIONS_DIR = path.join(__dirname, "migrations");
	const { db } = await startupWithRecovery(dbPath, mainLogger);

	const channels = new ChannelsRepo(db);
	const channelSessions = new ChannelSessionsRepo(db);
	const appSettings = new AppSettingsRepo(db);

	const manager = new PiSessionManager({
		appSettings,
		homeDir: os.homedir(),
	});
	piSessionManager = manager;
	manager.onEvent((event) => {
		for (const w of BrowserWindow.getAllWindows()) {
			w.webContents.send("macpi:pi-event", event);
		}
	});
	manager.setPathStore({
		getSessionFilePath: (id) =>
			channelSessions.getMeta(id)?.sessionFilePath ?? null,
		setSessionFilePath: (id, p) => channelSessions.setSessionFilePath(id, p),
	});

	const skillsService = new SkillsService({
		appSettings,
		homeDir: os.homedir(),
		loadSkills: () => manager.loadSkills(),
		loadPackageManager: () => manager.loadPackageManager(),
		emitEvent: (event) => manager.broadcastEvent(event),
	});

	const extensionsService = new ExtensionsService({
		appSettings,
		homeDir: os.homedir(),
		loadExtensions: () => manager.loadExtensions(),
		loadPackageManager: () => manager.loadPackageManager(),
		emitEvent: (event) => manager.broadcastEvent(event),
		runBiome: (filePath) => runBiomeCheck(filePath),
	});

	const branchService = new BranchService({
		// AgentSession is structurally compatible with BranchAgentSession; cast
		// to satisfy the locally-declared interface (which intentionally omits
		// pi's unstable internal fields).
		getAgentSession: (id) =>
			manager.getAgentSession(id) as unknown as BranchAgentSession | undefined,
		channelSessions,
		piSessionManager: {
			getActiveSessionMeta: (id) => channelSessions.findMeta(id),
			attachSessionByFile: (path) => manager.attachSessionByFile(path),
		},
		emitEvent: (event) => manager.broadcastEvent(event),
	});

	router = new IpcRouter({
		channels,
		channelSessions,
		piSessionManager: manager,
		appSettings,
		skillsService,
		extensionsService,
		branchService,
		dialog: electronDialogHandlers,
		getDefaultCwd,
		mainLogger,
		rendererLogger,
	});
	router.attach();

	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	router?.detach();
	piSessionManager?.shutdown();
	mainLogger?.close();
	rendererLogger?.close();
	if (process.platform !== "darwin") app.quit();
});
