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
	importSelectedPiTopLevelFiles,
	listPiTopLevelFiles,
} from "../../src/main/pi-import";
import { friendlyNameForSource } from "../../src/shared/friendly-name";

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

	it("strips pi's local: prefix and keeps the trailing path segment", () => {
		// pi-coding-agent normalises local installs to "local:<absolute path>"
		expect(friendlyNameForSource("local:/Users/me/code/asdf")).toBe("asdf");
		expect(friendlyNameForSource("local:./rel/path/foo")).toBe("foo");
	});

	it("returns the source itself for unrecognized forms", () => {
		expect(friendlyNameForSource("opaque-string")).toBe("opaque-string");
	});
});

describe("listPiTopLevelFiles", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-toplevel-list-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
		mkdirSync(path.join(piAgentRoot, "prompts"), { recursive: true });
		mkdirSync(macpiRoot, { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("returns top-level files AND directories sorted by name", () => {
		// Pi's modern skill format is a directory containing SKILL.md; the
		// older "loose markdown file" format still works too. Both must appear.
		writeFileSync(path.join(piAgentRoot, "skills/zebra.md"), "z");
		writeFileSync(path.join(piAgentRoot, "skills/alpha.md"), "a");
		mkdirSync(path.join(piAgentRoot, "skills/grill-me"));
		writeFileSync(
			path.join(piAgentRoot, "skills/grill-me/SKILL.md"),
			"# grill",
		);

		const r = listPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
		});
		expect(r.map((x) => `${x.name}:${x.kind}`)).toEqual([
			"alpha.md:file",
			"grill-me:directory",
			"zebra.md:file",
		]);
	});

	it("works against the prompts subdir identically", () => {
		writeFileSync(path.join(piAgentRoot, "prompts/recap.md"), "r");
		writeFileSync(path.join(piAgentRoot, "prompts/summarize.md"), "s");

		const r = listPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "prompts",
		});
		expect(r.map((x) => x.name)).toEqual(["recap.md", "summarize.md"]);
	});

	it("flags alreadyImported=true on basename collision", () => {
		writeFileSync(path.join(piAgentRoot, "prompts/a.md"), "pi");
		mkdirSync(path.join(macpiRoot, "prompts"));
		writeFileSync(path.join(macpiRoot, "prompts/a.md"), "macpi");

		const r = listPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "prompts",
		});
		expect(r).toEqual([
			expect.objectContaining({ name: "a.md", alreadyImported: true }),
		]);
	});

	it("returns empty when the subdir doesn't exist", () => {
		rmSync(path.join(piAgentRoot, "skills"), { recursive: true });
		const r = listPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
		});
		expect(r).toEqual([]);
	});
});

describe("importSelectedPiTopLevelFiles", () => {
	let homeDir: string;
	let piAgentRoot: string;
	let macpiRoot: string;

	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-toplevel-import-"));
		piAgentRoot = path.join(homeDir, ".pi/agent");
		macpiRoot = path.join(homeDir, ".macpi");
		mkdirSync(path.join(piAgentRoot, "skills"), { recursive: true });
		mkdirSync(path.join(piAgentRoot, "prompts"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies only the named skill files", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "A");
		writeFileSync(path.join(piAgentRoot, "skills/b.md"), "B");
		writeFileSync(path.join(piAgentRoot, "skills/c.md"), "C");

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
			names: ["a.md", "c.md"],
		});
		expect(r).toEqual({ copied: 2, skipped: 0 });
		expect(existsSync(path.join(macpiRoot, "skills/a.md"))).toBe(true);
		expect(existsSync(path.join(macpiRoot, "skills/b.md"))).toBe(false);
		expect(existsSync(path.join(macpiRoot, "skills/c.md"))).toBe(true);
	});

	it("imports prompts into macpi/prompts/", () => {
		writeFileSync(path.join(piAgentRoot, "prompts/recap.md"), "recap body");

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "prompts",
			names: ["recap.md"],
		});
		expect(r).toEqual({ copied: 1, skipped: 0 });
		expect(readFileSync(path.join(macpiRoot, "prompts/recap.md"), "utf8")).toBe(
			"recap body",
		);
	});

	it("never overwrites existing files", () => {
		writeFileSync(path.join(piAgentRoot, "skills/a.md"), "pi-version");
		mkdirSync(path.join(macpiRoot, "skills"), { recursive: true });
		writeFileSync(path.join(macpiRoot, "skills/a.md"), "keep-me");

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
			names: ["a.md"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
		expect(readFileSync(path.join(macpiRoot, "skills/a.md"), "utf8")).toBe(
			"keep-me",
		);
	});

	it("skips names that don't exist on disk", () => {
		writeFileSync(path.join(piAgentRoot, "skills/real.md"), "x");

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
			names: ["real.md", "ghost.md"],
		});
		expect(r).toEqual({ copied: 1, skipped: 1 });
	});

	it("recursively copies directory-based skills", () => {
		mkdirSync(path.join(piAgentRoot, "skills/grill-me"));
		writeFileSync(
			path.join(piAgentRoot, "skills/grill-me/SKILL.md"),
			"# grill",
		);
		mkdirSync(path.join(piAgentRoot, "skills/grill-me/assets"));
		writeFileSync(
			path.join(piAgentRoot, "skills/grill-me/assets/hint.md"),
			"hint",
		);

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
			names: ["grill-me"],
		});
		expect(r).toEqual({ copied: 1, skipped: 0 });
		expect(
			readFileSync(path.join(macpiRoot, "skills/grill-me/SKILL.md"), "utf8"),
		).toBe("# grill");
		expect(
			readFileSync(
				path.join(macpiRoot, "skills/grill-me/assets/hint.md"),
				"utf8",
			),
		).toBe("hint");
	});

	it("skips a directory when the target name already exists", () => {
		mkdirSync(path.join(piAgentRoot, "skills/grill-me"));
		writeFileSync(path.join(piAgentRoot, "skills/grill-me/SKILL.md"), "new");
		mkdirSync(path.join(macpiRoot, "skills/grill-me"), { recursive: true });
		writeFileSync(path.join(macpiRoot, "skills/grill-me/SKILL.md"), "keep-me");

		const r = importSelectedPiTopLevelFiles({
			piAgentRoot,
			macpiRoot,
			subdir: "skills",
			names: ["grill-me"],
		});
		expect(r).toEqual({ copied: 0, skipped: 1 });
		expect(
			readFileSync(path.join(macpiRoot, "skills/grill-me/SKILL.md"), "utf8"),
		).toBe("keep-me");
	});
});
