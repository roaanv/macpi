import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { currentVersion, runMigrations } from "../../src/main/db/migrations";

let dir: string;
let db: DbHandle;

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-mig-"));
	db = openDb({ filename: path.join(dir, "test.db") });
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
	it("starts at version 0 and applies 0001", () => {
		expect(currentVersion(db)).toBe(0);
		runMigrations(db);
		expect(currentVersion(db)).toBe(1);
	});

	it("is idempotent on re-run", () => {
		runMigrations(db);
		runMigrations(db);
		expect(currentVersion(db)).toBe(1);
	});

	it("creates the channels table", () => {
		runMigrations(db);
		const row = db.raw
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='channels'",
			)
			.get() as { name: string } | undefined;
		expect(row?.name).toBe("channels");
	});

	it("rolls back the transaction on a failing migration", () => {
		const fakeFs = {
			list: () => [
				{ version: 1, sql: "CREATE TABLE good (a INT);" },
				{ version: 2, sql: "CREATE TABLE bad (this is not sql);" },
			],
		};
		expect(() => runMigrations(db, fakeFs)).toThrow();
		const row = db.raw
			.prepare("SELECT name FROM sqlite_master WHERE name='good'")
			.get();
		expect(row).toBeTruthy();
		expect(currentVersion(db)).toBe(1);
	});
});
