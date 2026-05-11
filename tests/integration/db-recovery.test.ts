import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../../src/main/db/connection";
import { DbMigrationError, DbOpenError } from "../../src/main/db/errors";
import { runMigrations } from "../../src/main/db/migrations";

describe("db recovery", () => {
	it("openDb throws DbOpenError on corrupt file", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-corrupt-"));
		const file = path.join(dir, "macpi.db");
		writeFileSync(file, "not a sqlite file");
		expect(() => openDb({ filename: file })).toThrow(DbOpenError);
	});

	it("runMigrations throws DbMigrationError with version on bad SQL", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-mig-"));
		const db = openDb({ filename: path.join(dir, "macpi.db") });
		const fsImpl = {
			list: () => [{ version: 1, sql: "THIS IS NOT SQL" }],
		};
		let thrown: DbMigrationError | null = null;
		try {
			runMigrations(db, fsImpl);
		} catch (e) {
			thrown = e as DbMigrationError;
		}
		expect(thrown).toBeInstanceOf(DbMigrationError);
		expect(thrown?.version).toBe(1);
		db.close();
	});

	it("runMigrations preserves the underlying cause", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-mig2-"));
		const db = openDb({ filename: path.join(dir, "macpi.db") });
		const fsImpl = {
			list: () => [
				{
					version: 2,
					sql: "CREATE TABLE bad (id INTEGER); CREATE TABLE bad (id INTEGER);",
				},
			],
		};
		let thrown: DbMigrationError | null = null;
		try {
			runMigrations(db, fsImpl);
		} catch (e) {
			thrown = e as DbMigrationError;
		}
		expect(thrown?.cause).toBeInstanceOf(Error);
		db.close();
	});
});
