// IPC router: registers and dispatches all macpi:invoke IPC calls from the renderer.
// Each method is registered in the constructor with full type safety via the IpcMethods
// registry. Errors are caught and returned as structured IpcResult values.

import { ipcMain } from "electron";
import {
	err,
	type IpcMethodName,
	type IpcMethods,
	type IpcResult,
	ok,
} from "../shared/ipc-types";
import type { PiSessionManager } from "./pi-session-manager";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import type { ChannelsRepo } from "./repos/channels";

type Handler<M extends IpcMethodName> = (
	args: IpcMethods[M]["req"],
) => Promise<IpcResult<IpcMethods[M]["res"]>> | IpcResult<IpcMethods[M]["res"]>;

export interface RouterDeps {
	channels: ChannelsRepo;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: PiSessionManager;
}

export class IpcRouter {
	private handlers = new Map<IpcMethodName, Handler<IpcMethodName>>();

	constructor(private readonly deps: RouterDeps) {
		this.register("ping", async (args) => ok({ value: args.value }));
		this.register("channels.list", async () =>
			ok({ channels: this.deps.channels.list() }),
		);
		this.register("channels.create", async (args) => {
			const c = this.deps.channels.create({ name: args.name, icon: args.icon });
			return ok({ id: c.id });
		});
		this.register("channels.rename", async (args) => {
			this.deps.channels.rename(args.id, args.name);
			return ok({});
		});
		this.register("channels.delete", async (args) => {
			this.deps.channels.delete(args.id);
			return ok({});
		});
		this.register("session.create", async (args) => {
			const channel = this.deps.channels.getById(args.channelId);
			if (!channel)
				return err("not_found", `channel ${args.channelId} not found`);
			const piSessionId = await this.deps.piSessionManager.createSession({
				cwd: args.cwd,
			});
			this.deps.channelSessions.attach(args.channelId, piSessionId);
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
		this.register("session.abort", async (args) => {
			await this.deps.piSessionManager.abort(args.piSessionId);
			return ok({});
		});
		this.register("session.listForChannel", async (args) => {
			return ok({
				piSessionIds: this.deps.channelSessions.listByChannel(args.channelId),
			});
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
