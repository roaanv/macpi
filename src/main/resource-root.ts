// Resolves MacPi's app-owned resource root path from settings (with ~/.macpi
// default) and ensures the directory exists. Pi runtime resources deliberately
// use ~/.pi/agent instead; this root is only for MacPi app data such as notes,
// auth, and model settings.

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
