// Spawns `npx @biomejs/biome check --reporter=json <file>` and parses the
// output into renderer-safe ExtensionDiagnostic[]. Errors (Biome missing,
// non-JSON output, timeout) are surfaced as a single error diagnostic so
// the UI always renders something useful.

import { spawn } from "node:child_process";
import type { ExtensionDiagnostic } from "../shared/extensions-types";

interface SpawnResult {
	stdout: string;
	stderr: string;
	code: number;
}

type Spawner = (file: string) => Promise<SpawnResult>;

const realSpawner: Spawner = (file) =>
	new Promise((resolve) => {
		const proc = spawn(
			"npx",
			["@biomejs/biome", "check", "--reporter=json", file],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("close", (code) => {
			resolve({ stdout, stderr, code: code ?? -1 });
		});
		proc.on("error", () => {
			resolve({ stdout: "", stderr: "biome spawn failed", code: -1 });
		});
	});

let spawner: Spawner | null = null;

/** Test-only hook. Production code uses the real spawner. */
export function __setSpawnerForTesting(s: Spawner | null): void {
	spawner = s;
}

export async function runBiomeCheck(
	filePath: string,
	timeoutMs = 5000,
): Promise<ExtensionDiagnostic[]> {
	const activeSpawner = spawner ?? realSpawner;
	let timedOut = false;
	const timer = new Promise<SpawnResult>((resolve) =>
		setTimeout(() => {
			timedOut = true;
			resolve({ stdout: "", stderr: "timeout", code: -1 });
		}, timeoutMs),
	);
	const result = await Promise.race([activeSpawner(filePath), timer]);
	if (timedOut) {
		return [
			{
				severity: "error",
				line: 0,
				column: 0,
				message: `Biome lint timeout after ${timeoutMs}ms`,
			},
		];
	}
	try {
		const parsed = JSON.parse(result.stdout) as {
			diagnostics?: Array<{
				severity?: string;
				message?: { content?: Array<{ content?: string }> };
				location?: { span?: { start?: { line?: number; column?: number } } };
				category?: string;
			}>;
		};
		if (!parsed.diagnostics) return [];
		return parsed.diagnostics.map((d) => ({
			severity: mapSeverity(d.severity),
			line: d.location?.span?.start?.line ?? 0,
			column: d.location?.span?.start?.column ?? 0,
			message: extractMessage(d.message) ?? "(no message)",
			rule: d.category,
		}));
	} catch {
		return [
			{
				severity: "error",
				line: 0,
				column: 0,
				message: `Biome output parse failed (stderr: ${result.stderr.slice(0, 200)})`,
			},
		];
	}
}

function mapSeverity(s: string | undefined): ExtensionDiagnostic["severity"] {
	if (s === "error" || s === "fatal") return "error";
	if (s === "warning" || s === "warn") return "warn";
	return "info";
}

function extractMessage(
	m: { content?: Array<{ content?: string }> } | undefined,
): string | undefined {
	if (!m?.content) return undefined;
	return m.content.map((c) => c.content ?? "").join("");
}
