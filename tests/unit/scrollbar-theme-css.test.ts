import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/renderer/styles.css", "utf8");

describe("theme-aware scrollbar CSS", () => {
	it("defines theme tokens for scrollbar colors", () => {
		expect(css).toContain("--scrollbar-track");
		expect(css).toContain("--scrollbar-thumb");
		expect(css).toContain("--scrollbar-thumb-hover");
	});

	it("styles Firefox and Chromium scrollbars using theme tokens", () => {
		expect(css).toContain("scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track)");
		expect(css).toContain("::-webkit-scrollbar-thumb");
		expect(css).toContain("background: var(--scrollbar-thumb)");
		expect(css).toContain("background: var(--scrollbar-thumb-hover)");
	});
});
