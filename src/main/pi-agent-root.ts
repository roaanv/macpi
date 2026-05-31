import fs from "node:fs";
import path from "node:path";

export function getGlobalPiAgentRoot(homeDir: string): string {
	return path.join(homeDir, ".pi", "agent");
}

export function ensureGlobalPiAgentRoot(homeDir: string): string {
	const root = getGlobalPiAgentRoot(homeDir);
	fs.mkdirSync(root, { recursive: true });
	return root;
}
