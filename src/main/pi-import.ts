// Lists and selectively imports skills/extensions from a pi installation
// into macpi's resource root. Skills = top-level files; extensions =
// directories. "Friendly name" is just the file/directory basename — pi
// itself has no manifest name field for these resources, matching the
// pi-extmgr convention.

import fs from "node:fs";
import path from "node:path";

export type ResourceKind = "skill" | "extension";

export interface PiResource {
	/** Display + identifier — basename of the file or directory. */
	name: string;
	/** Absolute path of the item in the pi tree. */
	sourcePath: string;
	/** True when an item with this basename already exists in macpi. */
	alreadyImported: boolean;
}

export interface ListInput {
	piAgentRoot: string;
	macpiRoot: string;
	kind: ResourceKind;
}

export interface ImportInput {
	piAgentRoot: string;
	macpiRoot: string;
	kind: ResourceKind;
	/** Basenames to import. Anything not in this list is skipped entirely. */
	names: readonly string[];
}

export interface ImportResult {
	copied: number;
	skipped: number;
}

/**
 * Walk the pi resource directory for `kind` and return one PiResource per
 * importable item. Skills are matched as top-level files; extensions as
 * top-level directories. Symlinks are followed (pi commonly symlinks
 * extensions/skills into a working tree).
 */
export function listPiResources(input: ListInput): PiResource[] {
	const sourceDir = path.join(input.piAgentRoot, dirNameFor(input.kind));
	const targetDir = path.join(input.macpiRoot, dirNameFor(input.kind));
	if (!fs.existsSync(sourceDir)) return [];
	const out: PiResource[] = [];
	for (const name of fs.readdirSync(sourceDir)) {
		const sourcePath = path.join(sourceDir, name);
		const stat = safeStat(sourcePath);
		if (!stat) continue;
		const matchesKind =
			input.kind === "skill" ? stat.isFile() : stat.isDirectory();
		if (!matchesKind) continue;
		out.push({
			name,
			sourcePath,
			alreadyImported: fs.existsSync(path.join(targetDir, name)),
		});
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/**
 * Copy the named items from pi into macpi's resource root. Skip-if-exists;
 * never overwrites. Returns counts so the UI can confirm the result.
 */
export function importSelectedPiResources(input: ImportInput): ImportResult {
	const sourceDir = path.join(input.piAgentRoot, dirNameFor(input.kind));
	const targetDir = path.join(input.macpiRoot, dirNameFor(input.kind));
	if (!fs.existsSync(sourceDir)) return { copied: 0, skipped: 0 };
	fs.mkdirSync(targetDir, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const name of input.names) {
		const src = path.join(sourceDir, name);
		const dst = path.join(targetDir, name);
		const stat = safeStat(src);
		if (!stat) {
			skipped++;
			continue;
		}
		if (fs.existsSync(dst)) {
			skipped++;
			continue;
		}
		if (input.kind === "skill") {
			if (!stat.isFile()) {
				skipped++;
				continue;
			}
			fs.copyFileSync(src, dst);
			copied++;
		} else {
			if (!stat.isDirectory()) {
				skipped++;
				continue;
			}
			copyDirRecursive(src, dst);
			copied++;
		}
	}
	return { copied, skipped };
}

function dirNameFor(kind: ResourceKind): string {
	return kind === "skill" ? "skills" : "extensions";
}

/** Stat that follows symlinks; returns null when the target is missing/broken. */
function safeStat(p: string): fs.Stats | null {
	try {
		return fs.statSync(p);
	} catch {
		return null;
	}
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
