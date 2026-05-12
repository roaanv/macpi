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
	importSelectedPiResources,
	listPiResources,
} from "../../src/main/pi-import";

describe("listPiResources", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-list-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
		mkdirSync(path.join(piAgentRoot, "extensions"), { recursive: true });
		mkdirSync(macpiRoot, { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("returns skill files sorted by name", () => {
		writeFileSync(path.join(piAgentRoot, "skills/zebra.md"), "z");
		writeFileSync(path.join(piAgentRoot, "skills/alpha.md"), "a");
		// Subdirs aren't skills — should be ignored.
		mkdirSync(path.join(piAgentRoot, "skills/subdir"));

		const r = listPiResources({ piAgentRoot, macpiRoot, kind: "skill" });
		expect(r.map((x) => x.name)).toEqual(["alpha.md", "zebra.md"]);
	});

	it("returns extension directories only", () => {
		mkdirSync(path.join(piAgentRoot, "extensions/web-agent"));
		mkdirSync(path.join(piAgentRoot, "extensions/supacode"));
		// Top-level files in the extensions dir aren't extensions.
		writeFileSync(path.join(piAgentRoot, "extensions/loose.ts"), "x");

		const r = listPiResources({ piAgentRoot, macpiRoot, kind: "extension" });
		expect(r.map((x) => x.name)).toEqual(["supacode", "web-agent"]);
	});

	it("flags alreadyImported=true when the basename exists in macpi", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "pi");
		mkdirSync(path.join(macpiRoot, "skills"));
		writeFileSync(path.join(macpiRoot, "skills/a.md"), "macpi");

		const r = listPiResources({ piAgentRoot, macpiRoot, kind: "skill" });
		expect(r).toEqual([
			expect.objectContaining({ name: "a.md", alreadyImported: true }),
		]);
	});

	it("returns empty when the pi resource dir doesn't exist", () => {
		rmSync(path.join(piAgentRoot, "skills"), { recursive: true });
		const r = listPiResources({ piAgentRoot, macpiRoot, kind: "skill" });
		expect(r).toEqual([]);
	});
});

describe("importSelectedPiResources", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-sel-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
		mkdirSync(path.join(piAgentRoot, "extensions"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies only the named skills, leaves others alone", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "A");
		writeFileSync(path.join(piAgentRoot, "skills/b.md"), "B");
		writeFileSync(path.join(piAgentRoot, "skills/c.md"), "C");

		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "skill",
			names: ["a.md", "c.md"],
		});
		expect(r).toEqual({ copied: 2, skipped: 0 });
		expect(existsSync(path.join(macpiRoot, "skills/a.md"))).toBe(true);
		expect(existsSync(path.join(macpiRoot, "skills/b.md"))).toBe(false);
		expect(existsSync(path.join(macpiRoot, "skills/c.md"))).toBe(true);
	});

	it("recursively copies extension directories", () => {
		mkdirSync(path.join(piAgentRoot, "extensions/ext1"));
		writeFileSync(path.join(piAgentRoot, "extensions/ext1/index.ts"), "x");
		mkdirSync(path.join(piAgentRoot, "extensions/ext1/sub"));
		writeFileSync(path.join(piAgentRoot, "extensions/ext1/sub/y.ts"), "y");

		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "extension",
			names: ["ext1"],
		});
		expect(r).toEqual({ copied: 1, skipped: 0 });
		expect(
			readFileSync(path.join(macpiRoot, "extensions/ext1/sub/y.ts"), "utf8"),
		).toBe("y");
	});

	it("skips items that already exist at the target (never overwrites)", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "pi-version");
		mkdirSync(path.join(macpiRoot, "skills"), { recursive: true });
		writeFileSync(path.join(macpiRoot, "skills/a.md"), "keep-me");

		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "skill",
			names: ["a.md"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
		expect(readFileSync(path.join(macpiRoot, "skills/a.md"), "utf8")).toBe(
			"keep-me",
		);
	});

	it("skips names that don't exist in the pi tree", () => {
		writeFileSync(path.join(piAgentRoot, "skills/real.md"), "x");
		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "skill",
			names: ["real.md", "ghost.md"],
		});
		expect(r).toEqual({ copied: 1, skipped: 1 });
	});

	it("skill kind ignores directories even when explicitly named", () => {
		mkdirSync(path.join(piAgentRoot, "skills/folder"), { recursive: true });
		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "skill",
			names: ["folder"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
	});

	it("extension kind ignores files even when explicitly named", () => {
		writeFileSync(path.join(piAgentRoot, "extensions/loose.ts"), "x");
		const r = importSelectedPiResources({
			piAgentRoot,
			macpiRoot,
			kind: "extension",
			names: ["loose.ts"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
	});
});
