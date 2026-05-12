// Lists and selectively imports top-level resource files from a pi
// installation into macpi's resource root. Skills and prompts both live as
// top-level markdown files under ~/.pi/agent/<subdir>/ and use identical
// copy semantics. Extensions take a different path (see
// PiSessionManager.listConfiguredPiPackages + installPiPackage) because pi
// tracks them in settings.packages with npm/git/local-path sources.

import fs from "node:fs";
import path from "node:path";

export interface PiTopLevelFile {
	/** File basename — also the identifier used for selective import. */
	name: string;
	/** True when a file with this basename already exists in macpi. */
	alreadyImported: boolean;
}

export interface ListTopLevelInput {
	piAgentRoot: string;
	macpiRoot: string;
	/** Subdirectory under both pi's and macpi's resource roots, e.g. "skills" or "prompts". */
	subdir: string;
}

export interface ImportTopLevelInput extends ListTopLevelInput {
	/** Basenames to import. Anything not in this list is skipped entirely. */
	names: readonly string[];
}

export interface ImportResult {
	copied: number;
	skipped: number;
}

/** Top-level files in ~/.pi/agent/<subdir>, sorted by name. */
export function listPiTopLevelFiles(
	input: ListTopLevelInput,
): PiTopLevelFile[] {
	const sourceDir = path.join(input.piAgentRoot, input.subdir);
	const targetDir = path.join(input.macpiRoot, input.subdir);
	if (!fs.existsSync(sourceDir)) return [];
	const out: PiTopLevelFile[] = [];
	for (const name of fs.readdirSync(sourceDir)) {
		const sourcePath = path.join(sourceDir, name);
		if (!safeStat(sourcePath)?.isFile()) continue;
		out.push({
			name,
			alreadyImported: fs.existsSync(path.join(targetDir, name)),
		});
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Copy the named files from pi's <subdir> into macpi's matching subdir.
 * Skip-if-exists; never overwrites. Skips names that don't exist or aren't files.
 */
export function importSelectedPiTopLevelFiles(
	input: ImportTopLevelInput,
): ImportResult {
	const sourceDir = path.join(input.piAgentRoot, input.subdir);
	const targetDir = path.join(input.macpiRoot, input.subdir);
	if (!fs.existsSync(sourceDir)) return { copied: 0, skipped: 0 };
	fs.mkdirSync(targetDir, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const name of input.names) {
		const src = path.join(sourceDir, name);
		const dst = path.join(targetDir, name);
		if (!safeStat(src)?.isFile() || fs.existsSync(dst)) {
			skipped++;
			continue;
		}
		fs.copyFileSync(src, dst);
		copied++;
	}
	return { copied, skipped };
}

/** Stat that follows symlinks; returns null when the target is missing/broken. */
function safeStat(p: string): fs.Stats | null {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
}

/**
 * Strip the pi package source prefix to produce a human-friendly label.
 * Examples:
 *   "npm:pi-mcp-adapter"               -> "pi-mcp-adapter"
 *   "npm:@scope/pkg"                   -> "@scope/pkg"
 *   "git:https://github.com/foo/bar"   -> "foo/bar"
 *   "git:github.com/foo/bar"           -> "foo/bar"
 *   "/abs/path/to/extension"           -> "extension"
 *   "../relative/path/to/extension"    -> "extension"
 *   anything else                      -> source itself
 */
export function friendlyNameForSource(source: string): string {
	if (source.startsWith("npm:")) return source.slice(4);
	if (source.startsWith("git:")) {
		const rest = source.slice(4).replace(/^https?:\/\//, "");
		const parts = rest.split("/").filter(Boolean);
		return parts.slice(-2).join("/") || rest;
	}
	if (
		source.startsWith("/") ||
		source.startsWith("./") ||
		source.startsWith("../") ||
		source.startsWith("~")
	) {
		const parts = source.split(/[/\\]/).filter(Boolean);
		return parts[parts.length - 1] ?? source;
	}
	return source;
}
