import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	importResourcesFromPi,
	importSkillsFromPi,
} from "../../src/main/pi-import";

describe("importSkillsFromPi", () => {
	let homeDir: string;
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-"));
		mkdirSync(path.join(homeDir, ".pi/skills"), { recursive: true });
		mkdirSync(path.join(homeDir, ".macpi/skills"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies top-level skill files from ~/.pi/skills to ~/.macpi/skills", () => {
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
		writeFileSync(path.join(homeDir, ".pi/skills/b.md"), "# b");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(2);
		expect(r.skipped).toBe(0);
		expect(readFileSync(path.join(homeDir, ".macpi/skills/a.md"), "utf8")).toBe(
			"# a",
		);
	});

	it("skips files that already exist at the target", () => {
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# new");
		writeFileSync(path.join(homeDir, ".macpi/skills/a.md"), "# keep");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(0);
		expect(r.skipped).toBe(1);
		expect(readFileSync(path.join(homeDir, ".macpi/skills/a.md"), "utf8")).toBe(
			"# keep",
		);
	});

	it("no-ops when ~/.pi/skills doesn't exist", () => {
		rmSync(path.join(homeDir, ".pi/skills"), { recursive: true });
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(0);
		expect(r.skipped).toBe(0);
	});

	it("creates ~/.macpi/skills if missing", () => {
		rmSync(path.join(homeDir, ".macpi"), { recursive: true });
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(1);
		expect(existsSync(path.join(homeDir, ".macpi/skills/a.md"))).toBe(true);
	});

	it("ignores subdirectories (phase 1 imports top-level files only)", () => {
		mkdirSync(path.join(homeDir, ".pi/skills/nested"), { recursive: true });
		writeFileSync(path.join(homeDir, ".pi/skills/nested/x.md"), "# x");
		writeFileSync(path.join(homeDir, ".pi/skills/top.md"), "# top");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(1);
		expect(existsSync(path.join(homeDir, ".macpi/skills/top.md"))).toBe(true);
		expect(existsSync(path.join(homeDir, ".macpi/skills/nested"))).toBe(false);
	});
});

describe("importResourcesFromPi", () => {
	let homeDir: string;
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-all-"));
		mkdirSync(path.join(homeDir, ".pi/skills"), { recursive: true });
		mkdirSync(path.join(homeDir, ".pi/extensions"), { recursive: true });
		mkdirSync(path.join(homeDir, ".macpi"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies skills (files only) and extensions (files + dirs)", () => {
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
		writeFileSync(path.join(homeDir, ".pi/extensions/single.ts"), "x");
		mkdirSync(path.join(homeDir, ".pi/extensions/folded"));
		writeFileSync(path.join(homeDir, ".pi/extensions/folded/index.ts"), "y");
		const r = importResourcesFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.skills).toEqual({ copied: 1, skipped: 0 });
		expect(r.extensions).toEqual({ copied: 2, skipped: 0 });
		expect(
			readFileSync(
				path.join(homeDir, ".macpi/extensions/folded/index.ts"),
				"utf8",
			),
		).toBe("y");
	});

	it("skips skills subdirectories (files only) but recurses into extension dirs", () => {
		mkdirSync(path.join(homeDir, ".pi/skills/nested"));
		writeFileSync(path.join(homeDir, ".pi/skills/nested/x.md"), "# nested");
		mkdirSync(path.join(homeDir, ".pi/extensions/dir"));
		writeFileSync(path.join(homeDir, ".pi/extensions/dir/inner.ts"), "z");
		const r = importResourcesFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.skills.copied).toBe(0);
		expect(r.extensions.copied).toBe(1);
		expect(
			existsSync(path.join(homeDir, ".macpi/extensions/dir/inner.ts")),
		).toBe(true);
	});
});
