// Installs process-level handlers that turn uncaught exceptions into a
// crash report file + a blocking error dialog + a clean quit. There is
// no auto-respawn — relaunching is the user's choice.

import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import type { Logger } from "./logger";

export function installCrashHandler(logger: Logger, logsDir: string): void {
	let firing = false;

	const handle = (kind: "uncaught" | "rejection", err: unknown): void => {
		// Re-entrancy guard: if the dialog or fs.writeFileSync below somehow
		// throws, don't infinite-loop into the same handler.
		if (firing) return;
		firing = true;

		const stack =
			err instanceof Error ? (err.stack ?? err.message) : String(err);
		let recent: string[] = [];
		try {
			recent = logger.readRecent(200);
		} catch {
			// Reading recent log lines is best-effort — if it fails, the crash
			// report still has the stack.
		}
		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const file = path.join(logsDir, `crash-${ts}.log`);
		const body =
			`kind: ${kind}\n` +
			`time: ${new Date().toISOString()}\n` +
			`\n--- stack ---\n${stack}\n` +
			`\n--- last 200 log lines ---\n${recent.join("\n")}\n`;
		try {
			fs.writeFileSync(file, body);
		} catch {
			// Last-ditch — if the disk is broken we lose the file but the
			// dialog below still surfaces.
		}
		try {
			logger.error(`crash (${kind}): ${stack.split("\n")[0]}`);
			logger.flush();
		} catch {
			// Same — best-effort.
		}
		try {
			dialog.showErrorBox(
				"macpi crashed",
				`An unexpected error occurred and macpi must close.\n\nA crash report was written to:\n${file}`,
			);
		} catch {
			// On macOS during startup the dialog can throw if the app isn't
			// fully ready — swallow and exit anyway.
		}
		app.exit(1);
	};

	process.on("uncaughtException", (e) => handle("uncaught", e));
	process.on("unhandledRejection", (e) => handle("rejection", e));
}
