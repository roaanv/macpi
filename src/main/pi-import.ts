// Lists and selectively imports skills from a pi installation into macpi's
// resource root. Skills = top-level files copied straight across. Extensions
// take a different path (see PiSessionManager.listConfiguredPiPackages +
// installPiPackage) because pi tracks them in settings.packages with sources
// that can be npm/git/local-path — not just directories.

import fs from "node:fs";
import path from "node:path";

export interface PiSkill {
	/** File basename in ~/.pi/agent/skills (also the identifier). */
	name: string;
	/** True when a file with this basename already exists in macpi's skills. */
	alreadyImported: boolean;
}

export interface ListSkillsInput {
	piAgentRoot: string;
	macpiRoot: string;
}

export interface ImportSkillsInput {
	piAgentRoot: string;
	macpiRoot: string;
	/** Basenames to import. Anything not in this list is skipped entirely. */
	names: readonly string[];
}

export interface ImportResult {
	copied: number;
	skipped: number;
}

/** Top-level skill files in ~/.pi/agent/skills, sorted by name. */
export function listPiSkills(input: ListSkillsInput): PiSkill[] {
	const sourceDir = path.join(input.piAgentRoot, "skills");
	const targetDir = path.join(input.macpiRoot, "skills");
	if (!fs.existsSync(sourceDir)) return [];
	const out: PiSkill[] = [];
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
 * Copy the named skill files from pi into macpi's skills dir. Skip-if-exists;
 * never overwrites. Skips names that don't exist or aren't files.
 */
export function importSelectedPiSkills(input: ImportSkillsInput): ImportResult {
	const sourceDir = path.join(input.piAgentRoot, "skills");
	const targetDir = path.join(input.macpiRoot, "skills");
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
