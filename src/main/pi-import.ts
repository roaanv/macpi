// Copies top-level skills + extensions from a pi installation into macpi's
// resource root. Skip-if-exists; never overwrites. For extensions, copies
// directories recursively. Returns per-type counts.

import fs from "node:fs";
import path from "node:path";

export interface PiImportInput {
	piRoot: string;
	macpiRoot: string;
}

export interface PiImportResult {
	skills: { copied: number; skipped: number };
	extensions: { copied: number; skipped: number };
}

export function importResourcesFromPi(input: PiImportInput): PiImportResult {
	return {
		skills: copyDir(
			path.join(input.piRoot, "skills"),
			path.join(input.macpiRoot, "skills"),
			{ filesOnly: true },
		),
		extensions: copyDir(
			path.join(input.piRoot, "extensions"),
			path.join(input.macpiRoot, "extensions"),
			{ filesOnly: false },
		),
	};
}

function copyDir(
	src: string,
	dst: string,
	opts: { filesOnly: boolean },
): { copied: number; skipped: number } {
	if (!fs.existsSync(src)) return { copied: 0, skipped: 0 };
	fs.mkdirSync(dst, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const name of fs.readdirSync(src)) {
		const srcEntry = path.join(src, name);
		const dstEntry = path.join(dst, name);
		const stat = fs.statSync(srcEntry);
		if (stat.isFile()) {
			if (fs.existsSync(dstEntry)) {
				skipped++;
				continue;
			}
			fs.copyFileSync(srcEntry, dstEntry);
			copied++;
		} else if (stat.isDirectory()) {
			if (opts.filesOnly) continue;
			if (fs.existsSync(dstEntry)) {
				skipped++;
				continue;
			}
			copyDirRecursive(srcEntry, dstEntry);
			copied++;
		}
	}
	return { copied, skipped };
}

function copyDirRecursive(src: string, dst: string): void {
	fs.mkdirSync(dst, { recursive: true });
	for (const name of fs.readdirSync(src)) {
		const s = path.join(src, name);
		const d = path.join(dst, name);
		const stat = fs.statSync(s);
		if (stat.isFile()) fs.copyFileSync(s, d);
		else if (stat.isDirectory()) copyDirRecursive(s, d);
	}
}

// Backward-compat alias for any caller still using the skills-only entry point.
export function importSkillsFromPi(input: PiImportInput): {
	copied: number;
	skipped: number;
} {
	return importResourcesFromPi(input).skills;
}
