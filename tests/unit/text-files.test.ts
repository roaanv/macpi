// Unit tests for the text/markdown/hidden classification used by the file browser.

import { describe, expect, it } from "vitest";
import {
	IGNORED_NAMES,
	isMarkdownPath,
	isTextPath,
	shouldHide,
	TEXT_EXTENSIONS,
	TEXT_FILENAMES,
} from "../../src/shared/text-files";

describe("isTextPath", () => {
	it("returns true for allowlisted extensions, case-insensitively", () => {
		for (const name of ["a.md", "B.MD", "x.json", "y.ts", "z.YAML"]) {
			expect(isTextPath(name)).toBe(true);
		}
	});
	it("returns true for allowlisted bare filenames", () => {
		for (const name of ["Dockerfile", "Makefile", "LICENSE", "README"]) {
			expect(isTextPath(name)).toBe(true);
		}
	});
	it("returns true for dot-prefixed files whose extension is allowlisted", () => {
		expect(isTextPath(".env")).toBe(true);
		expect(isTextPath(".env.local")).toBe(true);
		expect(isTextPath(".gitignore")).toBe(true);
	});
	it("returns false for binary extensions", () => {
		for (const name of ["pic.png", "z.zip", "lib.so", "f.woff2", "v.mp4"]) {
			expect(isTextPath(name)).toBe(false);
		}
	});
	it("returns false for unknown extension-less files", () => {
		expect(isTextPath("random")).toBe(false);
	});
});

describe("isMarkdownPath", () => {
	it("matches .md and .markdown case-insensitively", () => {
		for (const name of ["a.md", "B.MD", "c.markdown", "D.MARKDOWN"]) {
			expect(isMarkdownPath(name)).toBe(true);
		}
	});
	it("rejects other text extensions", () => {
		for (const name of ["a.txt", "b.json", "c.ts"]) {
			expect(isMarkdownPath(name)).toBe(false);
		}
	});
});

describe("shouldHide", () => {
	it("hides dotfiles by default", () => {
		expect(shouldHide(".git", false)).toBe(true);
		expect(shouldHide(".env", false)).toBe(true);
	});
	it("hides IGNORED_NAMES entries by default", () => {
		expect(shouldHide("node_modules", false)).toBe(true);
		expect(shouldHide("dist", false)).toBe(true);
	});
	it("does not hide ordinary files", () => {
		expect(shouldHide("README.md", false)).toBe(false);
		expect(shouldHide("src", false)).toBe(false);
	});
	it("un-hides everything when showHidden is true", () => {
		expect(shouldHide(".git", true)).toBe(false);
		expect(shouldHide("node_modules", true)).toBe(false);
	});
});

describe("exported sets", () => {
	it("exposes TEXT_EXTENSIONS as a read-only Set of leading-dot strings", () => {
		expect(TEXT_EXTENSIONS.has(".md")).toBe(true);
		expect(TEXT_EXTENSIONS.has(".png")).toBe(false);
	});
	it("exposes TEXT_FILENAMES with case-preserved names", () => {
		expect(TEXT_FILENAMES.has("Dockerfile")).toBe(true);
	});
	it("exposes IGNORED_NAMES with common build-output folders", () => {
		expect(IGNORED_NAMES.has("node_modules")).toBe(true);
		expect(IGNORED_NAMES.has(".git")).toBe(true);
	});
});
