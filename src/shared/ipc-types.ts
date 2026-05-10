// IPC envelope used everywhere across renderer↔main and main↔pi-host boundaries.
// We never throw across the wire — every call returns ok() or err().

export type IpcResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: { code: string; message: string } };

export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
export const err = <T = never>(
	code: string,
	message: string,
): IpcResult<T> => ({
	ok: false,
	error: { code, message },
});

export const isOk = <T>(r: IpcResult<T>): r is { ok: true; data: T } => r.ok;
export const isErr = <T>(
	r: IpcResult<T>,
): r is { ok: false; error: { code: string; message: string } } => !r.ok;

// Method registry. Each entry maps method name → request/response shapes.
// Adding a method here is the only way to expose a new IPC call to the renderer.
// Lands progressively across this plan; entries are added when the corresponding
// handler is implemented (Tasks 9, 14, 18, 21, 26 of plan 1).
export interface IpcMethods {
	ping: { req: { value: string }; res: { value: string } };
	"channels.list": {
		req: Record<string, never>;
		res: {
			channels: {
				id: string;
				name: string;
				position: number;
				icon: string | null;
				createdAt: number;
			}[];
		};
	};
	"channels.create": {
		req: { name: string; icon?: string };
		res: { id: string };
	};
	"channels.rename": {
		req: { id: string; name: string };
		res: Record<string, never>;
	};
	"channels.delete": { req: { id: string }; res: Record<string, never> };
	"session.create": {
		req: { channelId: string; cwd: string };
		res: { piSessionId: string };
	};
	"session.prompt": {
		req: {
			piSessionId: string;
			text: string;
			/** Required when the session is streaming. "steer" interrupts; "followUp" queues. */
			streamingBehavior?: "steer" | "followUp";
		};
		res: Record<string, never>;
	};
	"session.clearQueue": {
		req: { piSessionId: string };
		/** Returns the cleared messages so the renderer can stash them as drafts if it wants. */
		res: { steering: string[]; followUp: string[] };
	};
	"session.abort": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.listForChannel": {
		req: { channelId: string };
		res: { piSessionIds: string[] };
	};
}

export type IpcMethodName = keyof IpcMethods;
