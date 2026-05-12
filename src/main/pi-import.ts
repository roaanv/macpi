// Lists and selectively imports top-level resource entries from a pi
// installation into macpi's resource root. Both pi formats are valid for
// skills/prompts:
//   - Loose markdown files (e.g. ~/.pi/agent/prompts/recap.md)
//   - Directories containing a manifest (e.g. ~/.pi/agent/skills/grill-me/SKILL.md)
// Symlinked directories (common when users link a working copy from a repo)
// are followed via fs.statSync, which dereferences by default.
//
// Extensions take a different path (see PiSessionManager.listConfiguredPiPackages
// + installPiPackage) because pi tracks them in settings.packages with
// npm/git/local-path sources.

import fs from "node:fs";
import path from "node:path";

export interface PiTopLevelEntry {
	/** Basename — also the identifier used for selective import. */
	name: string;
	/** "file" for loose .md, "directory" for manifest-based resources. */
	kind: "file" | "directory";
	/** True when an entry with this basename already exists in macpi. */
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

/** Top-level entries (files + directories) in ~/.pi/agent/<subdir>, sorted by name. */
export function listPiTopLevelFiles(
	input: ListTopLevelInput,
): PiTopLevelEntry[] {
	const sourceDir = path.join(input.piAgentRoot, input.subdir);
	const targetDir = path.join(input.macpiRoot, input.subdir);
	if (!fs.existsSync(sourceDir)) return [];
	const out: PiTopLevelEntry[] = [];
	for (const name of fs.readdirSync(sourceDir)) {
		const sourcePath = path.join(sourceDir, name);
		const stat = safeStat(sourcePath);
		if (!stat) continue;
		const kind: "file" | "directory" | null = stat.isFile()
			? "file"
			: stat.isDirectory()
				? "directory"
				: null;
		if (!kind) continue;
		out.push({
			name,
			kind,
			alreadyImported: fs.existsSync(path.join(targetDir, name)),
		});
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Copy the named entries from pi's <subdir> into macpi's matching subdir.
 * Files are copied via copyFileSync; directories are copied recursively.
 * Skip-if-exists; never overwrites. Skips names that don't exist.
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
		const stat = safeStat(src);
		if (!stat || fs.existsSync(dst)) {
			skipped++;
			continue;
		}
		if (stat.isFile()) {
			fs.copyFileSync(src, dst);
			copied++;
		} else if (stat.isDirectory()) {
			copyDirRecursive(src, dst);
			copied++;
		} else {
			skipped++;
		}
	}
	return { copied, skipped };
}

function copyDirRecursive(src: string, dst: string): void {
	fs.mkdirSync(dst, { recursive: true });
	for (const name of fs.readdirSync(src)) {
		const s = path.join(src, name);
		const d = path.join(dst, name);
		const stat = safeStat(s);
		if (!stat) continue;
		if (stat.isFile()) fs.copyFileSync(s, d);
		else if (stat.isDirectory()) copyDirRecursive(s, d);
	}
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
