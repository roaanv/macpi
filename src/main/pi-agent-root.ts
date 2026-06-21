import fs from "node:fs";
import path from "node:path";

export function getMacPiPiAgentRoot(macpiRoot: string): string {
	return path.join(macpiRoot, "pi-agent");
}

export function ensureMacPiPiAgentRoot(macpiRoot: string): string {
	const root = getMacPiPiAgentRoot(macpiRoot);
	fs.mkdirSync(root, { recursive: true });
	return root;
}
