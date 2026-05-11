// Resolves the resource root path from settings (with ~/.macpi default) and
// ensures the directory exists. Called once per session-create so users who
// change the setting see effects on the next session.

import fs from "node:fs";
import { getResourceRoot } from "../shared/app-settings-keys";

export function ensureResourceRoot(
	settings: Record<string, unknown>,
	homeDir: string,
): string {
	const root = getResourceRoot(settings, homeDir);
	fs.mkdirSync(root, { recursive: true });
	return root;
}
