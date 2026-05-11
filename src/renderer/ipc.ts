// Thin wrapper around window.macpi that unwraps IpcResult envelopes and
// provides a typed invoke() helper for use in React components and queries.

import type { IpcMethodName, IpcMethods, IpcResult } from "../shared/ipc-types";

export class IpcError extends Error {
	constructor(
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "IpcError";
	}
}

export async function invoke<M extends IpcMethodName>(
	method: M,
	args: IpcMethods[M]["req"],
): Promise<IpcMethods[M]["res"]> {
	const r: IpcResult<IpcMethods[M]["res"]> = await window.macpi.invoke(
		method,
		args,
	);
	if (r.ok) return r.data;
	throw new IpcError(r.error.code, r.error.message);
}

export function onPiEvent(listener: (event: unknown) => void): () => void {
	return window.macpi.onPiEvent(listener);
}

export function logToMain(
	level: "info" | "warn" | "error",
	message: string,
): void {
	// Best-effort: never throw from a logger. Swallow IPC failures.
	void invoke("system.log", { stream: "renderer", level, message }).catch(
		() => {},
	);
}
