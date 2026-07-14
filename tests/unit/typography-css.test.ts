import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/renderer/styles.css", "utf8");

const roleSelectors = [
	".type-view-title",
	".type-section-heading",
	".type-body",
	".type-control",
	".type-label",
	".type-metadata",
	".type-overline",
	".type-status",
	".type-code",
];

describe("typography CSS contract", () => {
	it("defines the consistent default family system", () => {
		expect(css).toMatch(/--font-display:\s*"Bricolage Grotesque Variable"/);
		expect(css).toMatch(/--font-interface:\s*"Inter Variable"/);
		expect(css).toContain("--font-content: var(--font-interface)");
		expect(css).toMatch(/--font-mono:\s*"JetBrains Mono Variable"/);
	});

	it("keeps theme typography opt-in", () => {
		expect(css).toContain('html[data-typography-preset="theme"]');
		expect(css).toContain("--theme-font-display");
		expect(css).toContain("--theme-font-interface");
		expect(css).toContain("--theme-font-content");
		expect(css).toContain("--theme-font-mono");
	});

	it.each(roleSelectors)("defines %s", (selector) => {
		expect(css).toContain(selector);
	});

	it("defines behavior modifiers", () => {
		for (const selector of [
			".type-compact",
			".type-assistant",
			".type-user",
			".type-composer",
			".type-tabular",
			".type-ellipsis",
			".type-technical-wrap",
		]) {
			expect(css).toContain(selector);
		}
	});
});
