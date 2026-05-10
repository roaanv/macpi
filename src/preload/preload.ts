// Preload script: exposes the macpi API to the renderer via contextBridge.
// Provides type-safe IPC invoke and pi-event subscription.

import { contextBridge, ipcRenderer } from "electron";
import type { IpcMethodName, IpcMethods, IpcResult } from "../shared/ipc-types";

const api = {
	invoke<M extends IpcMethodName>(
		method: M,
		args: IpcMethods[M]["req"],
	): Promise<IpcResult<IpcMethods[M]["res"]>> {
		return ipcRenderer.invoke("macpi:invoke", method, args);
	},
	onPiEvent(listener: (event: unknown) => void): () => void {
		const wrapped = (_e: Electron.IpcRendererEvent, ev: unknown) =>
			listener(ev);
		ipcRenderer.on("macpi:pi-event", wrapped);
		return () => {
			ipcRenderer.off("macpi:pi-event", wrapped);
		};
	},
};

contextBridge.exposeInMainWorld("macpi", api);

declare global {
	interface Window {
		macpi: typeof api;
	}
}
