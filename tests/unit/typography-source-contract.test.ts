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
const joined = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const arbitraryTextSizePattern =
	/text-\[((?:-?\d+(?:\.\d+)?|-?\.\d+))(px|rem|pt)\]/g;

function subMinimumTextSizes(source: string): string[] {
	return Array.from(source.matchAll(arbitraryTextSizePattern))
		.filter(([, value, unit]) => {
			const numericValue = Number(value);
			const pixels =
				unit === "rem"
					? numericValue * 16
					: unit === "pt"
						? numericValue * (4 / 3)
						: numericValue;
			return pixels < 11;
		})
		.map(([token]) => token);
}

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
		for (const file of sourceFiles) {
			expect(subMinimumTextSizes(readFileSync(file, "utf8")), file).toEqual([]);
		}
	});

	it("rejects decimal px, rem, and pt values below 11px", () => {
		for (const token of [
			"text-[9.5px]",
			"text-[10.0px]",
			"text-[0.625rem]",
			"text-[8pt]",
		]) {
			expect(subMinimumTextSizes(token), token).toHaveLength(1);
		}
	});

	it("allows text sizes at the 11px minimum", () => {
		expect(subMinimumTextSizes("text-[11px]")).toEqual([]);
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
