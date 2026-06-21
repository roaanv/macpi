// Resolves MacPi's app-owned resource root path from settings (with ~/.macpi
// default) and ensures the directory exists. MacPi's Pi runtime state lives
// beneath this root at <macpiRoot>/pi-agent; auth/model files and notes also
// remain MacPi-owned.

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
