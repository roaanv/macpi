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
	friendlyNameForSource,
	importSelectedPiSkills,
	listPiSkills,
} from "../../src/main/pi-import";

describe("friendlyNameForSource", () => {
	it("strips npm: prefix", () => {
		expect(friendlyNameForSource("npm:pi-mcp-adapter")).toBe("pi-mcp-adapter");
	});

	it("preserves scoped npm names", () => {
		expect(friendlyNameForSource("npm:@scope/pkg")).toBe("@scope/pkg");
	});

	it("strips git: prefix and keeps last two path segments", () => {
		expect(friendlyNameForSource("git:https://github.com/foo/bar")).toBe(
			"foo/bar",
		);
		expect(friendlyNameForSource("git:github.com/foo/bar")).toBe("foo/bar");
	});

	it("reduces local paths to the trailing segment", () => {
		expect(friendlyNameForSource("/abs/path/to/extension")).toBe("extension");
		expect(friendlyNameForSource("../rel/path/to/thing")).toBe("thing");
		expect(friendlyNameForSource("./local-ext")).toBe("local-ext");
	});

	it("returns the source itself for unrecognized forms", () => {
		expect(friendlyNameForSource("opaque-string")).toBe("opaque-string");
	});
});

describe("listPiSkills", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-skills-list-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
		mkdirSync(macpiRoot, { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("returns top-level files sorted by name", () => {
		writeFileSync(path.join(piAgentRoot, "skills/zebra.md"), "z");
		writeFileSync(path.join(piAgentRoot, "skills/alpha.md"), "a");
		// Subdirectories aren't skills.
		mkdirSync(path.join(piAgentRoot, "skills/subdir"));

		const r = listPiSkills({ piAgentRoot, macpiRoot });
		expect(r.map((x) => x.name)).toEqual(["alpha.md", "zebra.md"]);
	});

	it("flags alreadyImported=true on basename collision", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "pi");
		mkdirSync(path.join(macpiRoot, "skills"));
		writeFileSync(path.join(macpiRoot, "skills/a.md"), "macpi");

		const r = listPiSkills({ piAgentRoot, macpiRoot });
		expect(r).toEqual([
			expect.objectContaining({ name: "a.md", alreadyImported: true }),
		]);
	});

	it("returns empty when ~/.pi/agent/skills doesn't exist", () => {
		rmSync(path.join(piAgentRoot, "skills"), { recursive: true });
		expect(listPiSkills({ piAgentRoot, macpiRoot })).toEqual([]);
	});
});

describe("importSelectedPiSkills", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-skills-import-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies only the named files", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "A");
		writeFileSync(path.join(piAgentRoot, "skills/b.md"), "B");
		writeFileSync(path.join(piAgentRoot, "skills/c.md"), "C");

		const r = importSelectedPiSkills({
			piAgentRoot,
			macpiRoot,
			names: ["a.md", "c.md"],
		});
		expect(r).toEqual({ copied: 2, skipped: 0 });
		expect(existsSync(path.join(macpiRoot, "skills/a.md"))).toBe(true);
		expect(existsSync(path.join(macpiRoot, "skills/b.md"))).toBe(false);
		expect(existsSync(path.join(macpiRoot, "skills/c.md"))).toBe(true);
	});

	it("never overwrites existing files", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "pi-version");
		mkdirSync(path.join(macpiRoot, "skills"), { recursive: true });
		writeFileSync(path.join(macpiRoot, "skills/a.md"), "keep-me");

		const r = importSelectedPiSkills({
			piAgentRoot,
			macpiRoot,
			names: ["a.md"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
		expect(readFileSync(path.join(macpiRoot, "skills/a.md"), "utf8")).toBe(
			"keep-me",
		);
	});

	it("skips names that don't exist or aren't files", () => {
		writeFileSync(path.join(piAgentRoot, "skills/real.md"), "x");
		mkdirSync(path.join(piAgentRoot, "skills/folder"));

		const r = importSelectedPiSkills({
			piAgentRoot,
			macpiRoot,
			names: ["real.md", "ghost.md", "folder"],
		});
		expect(r).toEqual({ copied: 1, skipped: 2 });
	});
});
