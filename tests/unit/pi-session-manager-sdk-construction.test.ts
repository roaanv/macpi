import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

const piMock = vi.hoisted(() => {
	const settingsManagers: Array<{ applyOverrides: Mock }> = [];
	const resourceLoaderOptions: unknown[] = [];
	const packageManagerOptions: unknown[] = [];
	const createAgentSession = vi.fn();
	const sessionOpen = vi.fn();
	const defaultPackageManager = vi.fn(function (
		this: Record<string, unknown>,
		options: unknown,
	) {
		packageManagerOptions.push(options);
		this.listConfiguredPackages = vi.fn(() => []);
		this.installAndPersist = vi.fn(async () => undefined);
		this.removeAndPersist = vi.fn(async () => true);
		this.update = vi.fn(async () => undefined);
		this.setProgressCallback = vi.fn();
	});
	const defaultResourceLoader = vi.fn(function (
		this: Record<string, unknown>,
		options: unknown,
	) {
		resourceLoaderOptions.push(options);
		this.reload = vi.fn(async () => undefined);
		this.getSkills = vi.fn(() => ({ skills: [], diagnostics: [] }));
		this.getPrompts = vi.fn(() => ({ prompts: [], diagnostics: [] }));
		this.getExtensions = vi.fn(() => ({ extensions: [], errors: [] }));
	});
	const settingsCreate = vi.fn(() => {
		const manager = { applyOverrides: vi.fn() };
		settingsManagers.push(manager);
		return manager;
	});
	return {
		createAgentSession,
		defaultPackageManager,
		defaultResourceLoader,
		packageManagerOptions,
		resourceLoaderOptions,
		sessionOpen,
		settingsCreate,
		settingsManagers,
	};
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: { create: vi.fn(() => ({})) },
	ModelRegistry: { create: vi.fn(() => ({})) },
	SettingsManager: { create: piMock.settingsCreate },
	DefaultResourceLoader: piMock.defaultResourceLoader,
	DefaultPackageManager: piMock.defaultPackageManager,
	SessionManager: { open: piMock.sessionOpen },
	createAgentSession: piMock.createAgentSession,
}));

function makeManager(agentDir: string) {
	return new PiSessionManager({
		appSettings: { getAll: () => ({}) } as never,
		agentDir,
	});
}

describe("PiSessionManager SDK construction", () => {
	let dir: string;
	let agentDir: string;
	let originalPath: string | undefined;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-sdk-construction-"));
		agentDir = path.join(dir, "pi-agent");
		originalPath = process.env.PATH;
		piMock.createAgentSession.mockResolvedValue({
			session: {
				sessionId: "created-1",
				sessionFile: path.join(agentDir, "sessions", "created-1.jsonl"),
				subscribe: vi.fn(() => () => undefined),
			},
		});
		piMock.sessionOpen.mockReturnValue({
			getCwd: () => path.join(dir, "project"),
		});
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
		if (originalPath === undefined) delete process.env.PATH;
		else process.env.PATH = originalPath;
		vi.clearAllMocks();
		piMock.resourceLoaderOptions.length = 0;
		piMock.packageManagerOptions.length = 0;
		piMock.settingsManagers.length = 0;
	});

	it("passes agentDir and npm override to createAgentSession", async () => {
		let seenPath: string | undefined;
		piMock.createAgentSession.mockImplementationOnce(async () => {
			seenPath = process.env.PATH;
			return {
				session: {
					sessionId: "created-1",
					sessionFile: path.join(agentDir, "sessions", "created-1.jsonl"),
					subscribe: vi.fn(() => () => undefined),
				},
			};
		});

		const manager = makeManager(agentDir);
		await manager.createSession({
			cwd: path.join(dir, "project"),
		});

		expect(piMock.settingsCreate).toHaveBeenCalledWith(
			path.join(dir, "project"),
			agentDir,
		);
		expect(piMock.settingsManagers.at(-1)?.applyOverrides).toHaveBeenCalledWith(
			{
				npmCommand: ["npm", "--prefix", path.join(agentDir, "npm")],
			},
		);
		expect(piMock.resourceLoaderOptions[0]).toMatchObject({
			cwd: path.join(dir, "project"),
			agentDir,
			settingsManager: piMock.settingsManagers[0],
		});
		expect(piMock.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: path.join(dir, "project"),
				agentDir,
				settingsManager: piMock.settingsManagers[1],
			}),
		);
		// biome-ignore lint/suspicious/noExplicitAny: verifies production SDK manager identity retained internally
		expect((manager as any).active.get("created-1").settingsManager).toBe(
			piMock.settingsManagers[1],
		);
		expect(seenPath?.split(path.delimiter)[0]).toBe(
			path.join(agentDir, "npm", "bin"),
		);
	});

	it("retains the SDK settings manager for both attach paths", async () => {
		const filePath = path.join(agentDir, "sessions", "created-1.jsonl");

		const byId = makeManager(agentDir);
		byId.setPathStore({
			getSessionFilePath: vi.fn(() => filePath),
			setSessionFilePath: vi.fn(),
		});
		await byId.attachSession({ piSessionId: "created-1" });
		// biome-ignore lint/suspicious/noExplicitAny: verifies production SDK manager identity retained internally
		expect((byId as any).active.get("created-1").settingsManager).toBe(
			piMock.settingsManagers.at(-1),
		);

		const byFile = makeManager(agentDir);
		byFile.setPathStore({
			getSessionFilePath: vi.fn(() => null),
			setSessionFilePath: vi.fn(),
		});
		await byFile.attachSessionByFile(filePath);
		// biome-ignore lint/suspicious/noExplicitAny: verifies production SDK manager identity retained internally
		expect((byFile as any).active.get("created-1").settingsManager).toBe(
			piMock.settingsManagers.at(-1),
		);
	});

	it("constructs package manager under the MacPi agent root", async () => {
		const pm = await makeManager(agentDir).loadPackageManager();

		expect(piMock.settingsCreate).toHaveBeenCalledWith(agentDir, agentDir);
		expect(piMock.settingsManagers[0].applyOverrides).toHaveBeenCalledWith({
			npmCommand: ["npm", "--prefix", path.join(agentDir, "npm")],
		});
		expect(piMock.packageManagerOptions[0]).toMatchObject({
			cwd: agentDir,
			agentDir,
			settingsManager: piMock.settingsManagers[0],
		});
		expect(fs.existsSync(path.join(agentDir, "npm"))).toBe(true);

		await pm.installAndPersist("npm:test", { local: false });
		const instance = piMock.defaultPackageManager.mock
			.instances[0] as unknown as Record<string, Mock>;
		expect(instance.installAndPersist).toHaveBeenCalledWith("npm:test", {
			local: false,
		});
	});

	it("discovers fallback session files under the MacPi agent root", async () => {
		const sessionDir = path.join(agentDir, "sessions", "encoded-project");
		fs.mkdirSync(sessionDir, { recursive: true });
		const filePath = path.join(sessionDir, "2026-created-1.jsonl");
		fs.writeFileSync(filePath, "");

		await makeManager(agentDir).attachSession({ piSessionId: "created-1" });

		expect(piMock.sessionOpen).toHaveBeenCalledWith(filePath);
		expect(piMock.createAgentSession).toHaveBeenCalledWith(
			expect.objectContaining({ agentDir }),
		);
	});
});
