import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return rendererSources(path);
		return /\.(?:css|tsx?)$/.test(entry.name) ? [path] : [];
	});
}

const sourceFiles = rendererSources("src/renderer");
const joined = sourceFiles
	.map((file) => readFileSync(file, "utf8"))
	.join("\n");

describe("typography source guardrails", () => {
	it("does not use retired font variables", () => {
		for (const retired of [
			"--font-family",
			"--font-family-mono",
			"--font-body",
			"--font-size-sidebar",
		]) {
			expect(joined).not.toContain(retired);
		}
	});

	it("does not use sub-11px text utilities", () => {
		expect(joined).not.toMatch(/text-\[(?:[0-9]|10)px\]/);
	});

	it("defines all semantic roles", () => {
		for (const role of [
			"type-view-title",
			"type-section-heading",
			"type-body",
			"type-control",
			"type-label",
			"type-metadata",
			"type-overline",
			"type-status",
			"type-code",
		]) {
			expect(joined).toContain(role);
		}
	});
});
