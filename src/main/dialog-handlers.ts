// Wraps Electron's native dialog APIs so they're testable. Renderer
// reaches these via the IPC router; main passes our handler in via
// constructor injection so tests can mock electron's `dialog` import.

import { dialog } from "electron";

export interface DialogHandlers {
	openFolder(opts: { defaultPath?: string }): Promise<{ path: string | null }>;
}

export const electronDialogHandlers: DialogHandlers = {
	async openFolder({ defaultPath }) {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			defaultPath,
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}
		return { path: result.filePaths[0] };
	},
};
