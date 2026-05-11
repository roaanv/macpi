// IPC router: registers and dispatches all macpi:invoke IPC calls from the renderer.
// Each method is registered in the constructor with full type safety via the IpcMethods
// registry. Errors are caught and returned as structured IpcResult values.

import { app, ipcMain, shell } from "electron";
import { getDefaultCwd as readDefaultCwdFromSettings } from "../shared/app-settings-keys";
import { resolveCwd } from "../shared/cwd-resolver";
import {
	err,
	type IpcMethodName,
	type IpcMethods,
	type IpcResult,
	ok,
} from "../shared/ipc-types";
import type { DialogHandlers } from "./dialog-handlers";
import type { Logger } from "./logger";
import type { PiSessionManager } from "./pi-session-manager";
import type { AppSettingsRepo } from "./repos/app-settings";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import type { ChannelsRepo } from "./repos/channels";
import type { SkillsService } from "./skills-service";

type Handler<M extends IpcMethodName> = (
	args: IpcMethods[M]["req"],
) => Promise<IpcResult<IpcMethods[M]["res"]>> | IpcResult<IpcMethods[M]["res"]>;

export interface RouterDeps {
	channels: ChannelsRepo;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: PiSessionManager;
	appSettings: AppSettingsRepo;
	skillsService: SkillsService;
	dialog: DialogHandlers;
	getDefaultCwd: () => string;
	mainLogger: Logger;
	rendererLogger: Logger;
}

export class IpcRouter {
	private handlers = new Map<IpcMethodName, Handler<IpcMethodName>>();

	constructor(private readonly deps: RouterDeps) {
		this.register("ping", async (args) => ok({ value: args.value }));
		this.register("system.log", async (args) => {
			const target =
				args.stream === "renderer"
					? this.deps.rendererLogger
					: this.deps.mainLogger;
			target[args.level](args.message);
			return ok({});
		});
		this.register("system.openLogsFolder", async () => {
			await shell.openPath(app.getPath("logs"));
			return ok({});
		});
		this.register("channels.list", async () =>
			ok({ channels: this.deps.channels.list() }),
		);
		this.register("channels.create", async (args) => {
			const c = this.deps.channels.create({
				name: args.name,
				icon: args.icon,
				cwd: args.cwd ?? null,
			});
			return ok({ id: c.id });
		});
		this.register("channels.rename", async (args) => {
			this.deps.channels.rename(args.id, args.name);
			return ok({});
		});
		this.register("channels.delete", async (args) => {
			const sessionIds = this.deps.channelSessions.listByChannel(args.id);
			if (sessionIds.length > 0 && !args.force) {
				return err(
					"non_empty",
					`channel has ${sessionIds.length} session(s); pass force:true to cascade`,
				);
			}
			for (const id of sessionIds) {
				this.deps.piSessionManager.disposeSession(id);
			}
			this.deps.channels.delete(args.id);
			return ok({});
		});
		this.register("session.create", async (args) => {
			const channel = this.deps.channels.getById(args.channelId);
			if (!channel)
				return err("not_found", `channel ${args.channelId} not found`);

			const settings = this.deps.appSettings.getAll();
			const cwd = resolveCwd({
				override: args.cwd,
				channelCwd: channel.cwd,
				defaultCwd: readDefaultCwdFromSettings(settings),
				homeDir: this.deps.getDefaultCwd(),
			});

			const { piSessionId, sessionFilePath } =
				await this.deps.piSessionManager.createSession({ cwd });
			this.deps.channelSessions.attach({
				channelId: args.channelId,
				piSessionId,
				cwd,
				sessionFilePath,
			});
			const label = args.label?.trim();
			if (label) {
				this.deps.channelSessions.setLabel(piSessionId, label);
			}
			return ok({ piSessionId });
		});
		this.register("session.prompt", async (args) => {
			await this.deps.piSessionManager.prompt(
				args.piSessionId,
				args.text,
				args.streamingBehavior,
			);
			return ok({});
		});
		this.register("session.clearQueue", async (args) => {
			const cleared = await this.deps.piSessionManager.clearQueue(
				args.piSessionId,
			);
			return ok(cleared);
		});
		this.register("session.removeFromQueue", async (args) => {
			await this.deps.piSessionManager.removeFromQueue(
				args.piSessionId,
				args.queue,
				args.index,
			);
			return ok({});
		});
		this.register("session.abort", async (args) => {
			await this.deps.piSessionManager.abort(args.piSessionId);
			return ok({});
		});
		this.register("session.attach", async (args) => {
			await this.deps.piSessionManager.attachSession({
				piSessionId: args.piSessionId,
			});
			const entries = this.deps.piSessionManager.getHistory(args.piSessionId);
			return ok({ entries });
		});
		this.register("session.listForChannel", async (args) => {
			return ok({
				piSessionIds: this.deps.channelSessions.listByChannel(args.channelId),
			});
		});
		this.register("session.rename", async (args) => {
			this.deps.channelSessions.setLabel(args.piSessionId, args.label);
			return ok({});
		});
		this.register("session.delete", async (args) => {
			this.deps.piSessionManager.disposeSession(args.piSessionId);
			this.deps.channelSessions.delete(args.piSessionId);
			return ok({});
		});
		this.register("session.getMeta", async (args) => {
			const meta = this.deps.channelSessions.getMeta(args.piSessionId);
			if (!meta)
				return err("not_found", `session ${args.piSessionId} not found`);
			return ok({
				piSessionId: meta.piSessionId,
				cwd: meta.cwd,
				label: meta.label,
			});
		});
		this.register("session.setFirstMessageLabel", async (args) => {
			const applied = this.deps.channelSessions.setFirstMessageLabel(
				args.piSessionId,
				args.text,
			);
			return ok({ applied });
		});
		this.register("session.findChannel", async (args) => {
			return ok({
				channelId: this.deps.channelSessions.findChannelOf(args.piSessionId),
			});
		});
		this.register("dialog.openFolder", async (args) => {
			return ok(
				await this.deps.dialog.openFolder({ defaultPath: args.defaultPath }),
			);
		});
		this.register("settings.getDefaultCwd", async () => {
			const settings = this.deps.appSettings.getAll();
			const configured = readDefaultCwdFromSettings(settings);
			return ok({
				cwd: configured.length > 0 ? configured : this.deps.getDefaultCwd(),
			});
		});
		this.register("settings.getAll", async () => {
			return ok({ settings: this.deps.appSettings.getAll() });
		});
		this.register("settings.set", async (args) => {
			this.deps.appSettings.set(args.key, args.value);
			return ok({});
		});
		this.register("skills.list", async () => {
			const skills = await this.deps.skillsService.list();
			return ok({ skills });
		});
		this.register("skills.read", async (args) => {
			try {
				const detail = await this.deps.skillsService.read(args.id);
				return ok(detail);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes("not found")) return err("not_found", msg);
				throw e;
			}
		});
		this.register("skills.save", async (args) => {
			try {
				await this.deps.skillsService.save(args.id, args.body);
				return ok({});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes("not found")) return err("not_found", msg);
				throw e;
			}
		});
		this.register("skills.setEnabled", async (args) => {
			await this.deps.skillsService.setEnabled(args.id, args.enabled);
			return ok({});
		});
		this.register("skills.install", async (args) => {
			try {
				await this.deps.skillsService.install(args.source);
				return ok({});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return err("install_failed", msg);
			}
		});
		this.register("skills.remove", async (args) => {
			try {
				await this.deps.skillsService.remove(args.source);
				return ok({});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return err("remove_failed", msg);
			}
		});
		this.register("skills.importFromPi", async () => {
			const r = await this.deps.skillsService.importFromPi();
			return ok(r);
		});
	}

	async dispatch<M extends IpcMethodName>(
		method: M,
		args: IpcMethods[M]["req"],
	): Promise<IpcResult<IpcMethods[M]["res"]>> {
		const handler = this.handlers.get(method);
		if (!handler)
			return err("unknown_method", `unknown IPC method ${String(method)}`);
		try {
			return await (handler(args as never) as Promise<
				IpcResult<IpcMethods[M]["res"]>
			>);
		} catch (e) {
			return err("exception", e instanceof Error ? e.message : String(e));
		}
	}

	attach(): void {
		ipcMain.handle(
			"macpi:invoke",
			async (_e, method: IpcMethodName, args: unknown) =>
				this.dispatch(method, args as never),
		);
	}

	detach(): void {
		ipcMain.removeHandler("macpi:invoke");
	}

	private register<M extends IpcMethodName>(method: M, fn: Handler<M>) {
		this.handlers.set(method, fn as unknown as Handler<IpcMethodName>);
	}
}
