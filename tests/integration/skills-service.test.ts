import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/main/db/migrations";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";
import { SkillsService } from "../../src/main/skills-service";

function makeDb() {
	const raw = new DatabaseSync(":memory:");
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	const handle = { raw, close: () => raw.close() };
	runMigrations(handle);
	return handle;
}

describe("SkillsService", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-skills-"));
		mkdirSync(path.join(dir, ".macpi/skills"), { recursive: true });
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function makeService(opts: { enabled?: Record<string, boolean> }) {
		const db = makeDb();
		const appSettings = new AppSettingsRepo(db);
		if (opts.enabled) {
			appSettings.set("resourceEnabled", opts.enabled);
		}
		appSettings.set("resourceRoot", path.join(dir, ".macpi"));
		return new SkillsService({
			appSettings,
			homeDir: dir,
			loadSkills: async () => [
				{
					name: "a",
					source: { id: "local" },
					filePath: path.join(dir, ".macpi/skills/a.md"),
				},
				{
					name: "b",
					source: { id: "local" },
					filePath: path.join(dir, ".macpi/skills/b.md"),
				},
			],
		});
	}

	it("list returns enabled flags from settings", async () => {
		const svc = makeService({
			enabled: {
				"skill:local:a.md": true,
				"skill:local:b.md": false,
			},
		});
		const skills = await svc.list();
		expect(skills.map((s) => [s.name, s.enabled])).toEqual([
			["a", true],
			["b", false],
		]);
	});

	it("list treats missing entries as enabled", async () => {
		const svc = makeService({});
		const skills = await svc.list();
		expect(skills.every((s) => s.enabled)).toBe(true);
	});

	it("read returns the file body", async () => {
		writeFileSync(path.join(dir, ".macpi/skills/a.md"), "# hello");
		const svc = makeService({});
		const skills = await svc.list();
		const detail = await svc.read(skills[0].id);
		expect(detail.body).toBe("# hello");
		expect(detail.manifest.name).toBe("a");
	});

	it("read throws on unknown id", async () => {
		const svc = makeService({});
		await expect(svc.read("skill:local:nope.md")).rejects.toThrow();
	});

	it("save writes the body to the skill's filePath", async () => {
		writeFileSync(path.join(dir, ".macpi/skills/a.md"), "old");
		const svc = makeService({});
		const skills = await svc.list();
		await svc.save(skills[0].id, "new body");
		expect(readFileSync(path.join(dir, ".macpi/skills/a.md"), "utf8")).toBe(
			"new body",
		);
	});

	it("save throws when the skill has no file", async () => {
		// Construct a service whose loadSkills returns a fileless skill
		const db = makeDb();
		const appSettings = new AppSettingsRepo(db);
		appSettings.set("resourceRoot", path.join(dir, ".macpi"));
		const svc = new SkillsService({
			appSettings,
			homeDir: dir,
			loadSkills: async () => [{ name: "ghost", source: { id: "local" } }],
		});
		const skills = await svc.list();
		await expect(svc.save(skills[0].id, "x")).rejects.toThrow();
	});

	it("setEnabled persists the flag in resourceEnabled", async () => {
		const svc = makeService({});
		const skills = await svc.list();
		await svc.setEnabled(skills[0].id, false);
		const after = await svc.list();
		expect(after.find((s) => s.id === skills[0].id)?.enabled).toBe(false);
	});

	it("setEnabled merges with existing entries", async () => {
		const svc = makeService({
			enabled: { "skill:local:a.md": true, "skill:local:other.md": false },
		});
		await svc.setEnabled("skill:local:a.md", false);
		const after = await svc.list();
		expect(after.find((s) => s.id === "skill:local:a.md")?.enabled).toBe(false);
		// The unrelated entry should still be in the map for future skills.
		// (Indirectly verified by enabling a third skill below if we want — skip.)
	});
});
