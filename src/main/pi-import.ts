// Copies top-level skills from a pi installation (~/.pi/skills) into
// macpi's resource root. Skip-if-exists; never overwrites. Phase 1
// imports only top-level files; package-installed skills (those that
// live under ~/.pi/packages or similar) are not touched.

import fs from "node:fs";
import path from "node:path";

export interface PiImportInput {
	piRoot: string;
	macpiRoot: string;
}

export interface PiImportResult {
	copied: number;
	skipped: number;
}

export function importSkillsFromPi(input: PiImportInput): PiImportResult {
	const src = path.join(input.piRoot, "skills");
	const dst = path.join(input.macpiRoot, "skills");
	if (!fs.existsSync(src)) return { copied: 0, skipped: 0 };
	fs.mkdirSync(dst, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const name of fs.readdirSync(src)) {
		const srcFile = path.join(src, name);
		const dstFile = path.join(dst, name);
		const stat = fs.statSync(srcFile);
		if (!stat.isFile()) continue;
		if (fs.existsSync(dstFile)) {
			skipped++;
			continue;
		}
		fs.copyFileSync(srcFile, dstFile);
		copied++;
	}
	return { copied, skipped };
}
