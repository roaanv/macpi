import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";

let dir: string;
let db: DbHandle;
let repo: AppSettingsRepo;

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-app-settings-"));
	db = openDb({ filename: path.join(dir, "test.db") });
	runMigrations(db);
	repo = new AppSettingsRepo(db);
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("AppSettingsRepo", () => {
	it("getAll returns empty object when no settings stored", () => {
		expect(repo.getAll()).toEqual({});
	});

	it("set then getAll round-trips a string value", () => {
		repo.set("theme", "dark");
		expect(repo.getAll()).toEqual({ theme: "dark" });
	});

	it("set then getAll round-trips a number value", () => {
		repo.set("fontSize.sidebar", 16);
		expect(repo.getAll()).toEqual({ "fontSize.sidebar": 16 });
	});

	it("set overwrites the previous value", () => {
		repo.set("theme", "light");
		repo.set("theme", "dark");
		expect(repo.getAll()).toEqual({ theme: "dark" });
	});

	it("getAll surfaces multiple keys", () => {
		repo.set("theme", "light");
		repo.set("fontFamily", "Inter");
		repo.set("fontSize.sidebar", 16);
		expect(repo.getAll()).toEqual({
			theme: "light",
			fontFamily: "Inter",
			"fontSize.sidebar": 16,
		});
	});

	it("preserves null values", () => {
		repo.set("defaultCwd", null);
		expect(repo.getAll()).toEqual({ defaultCwd: null });
	});
});
