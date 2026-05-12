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
		expect(currentVersion(db)).toBe(5);
	});

	it("is idempotent on re-run", () => {
		runMigrations(db);
		runMigrations(db);
		expect(currentVersion(db)).toBe(5);
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

	it("002 adds cwd and session_file_path columns to channel_sessions", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = (
			memDb.raw
				.prepare("PRAGMA table_info(channel_sessions)")
				.all() as unknown as Array<{ name: string }>
		).map((c) => c.name);
		expect(cols).toContain("cwd");
		expect(cols).toContain("session_file_path");
		memDb.close();
	});

	it("003 adds label and label_user_set columns to channel_sessions", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = memDb.raw
			.prepare("PRAGMA table_info(channel_sessions)")
			.all() as unknown as Array<{ name: string; dflt_value: unknown }>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("label");
		expect(colNames).toContain("label_user_set");
		const flag = cols.find((c) => c.name === "label_user_set");
		expect(flag?.dflt_value).toBe("0");
		memDb.close();
	});

	it("004 adds cwd column to channels", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = memDb.raw
			.prepare("PRAGMA table_info(channels)")
			.all() as unknown as Array<{ name: string }>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("cwd");
		memDb.close();
	});
});
