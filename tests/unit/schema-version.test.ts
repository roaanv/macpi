import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
	assertSchemaCompatible,
	KNOWN_MAX_VERSION,
} from "../../src/main/db/schema-version";

describe("schema-version", () => {
	function makeDb(maxApplied: number) {
		const raw = new DatabaseSync(":memory:");
		raw.exec(
			`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)`,
		);
		if (maxApplied > 0) {
			raw
				.prepare("INSERT INTO _migrations VALUES (?, ?)")
				.run(maxApplied, Date.now());
		}
		return { raw, close: () => raw.close() };
	}

	it("passes when applied == known max", () => {
		const db = makeDb(KNOWN_MAX_VERSION);
		expect(() => assertSchemaCompatible(db)).not.toThrow();
		db.close();
	});

	it("passes when applied < known max (we'll migrate)", () => {
		const db = makeDb(0);
		expect(() => assertSchemaCompatible(db)).not.toThrow();
		db.close();
	});

	it("throws DbSchemaNewerError when applied > known max", () => {
		const db = makeDb(KNOWN_MAX_VERSION + 1);
		expect(() => assertSchemaCompatible(db)).toThrow(/schema/i);
		db.close();
	});

	it("passes when _migrations table is empty (fresh DB)", () => {
		const db = makeDb(0);
		expect(() => assertSchemaCompatible(db)).not.toThrow();
		db.close();
	});

	it("passes when _migrations table doesn't exist (brand-new SQLite file)", () => {
		// First-run on a new machine: openDb creates an empty file, then
		// assertSchemaCompatible runs BEFORE runMigrations creates the
		// _migrations table. Must not throw.
		const raw = new DatabaseSync(":memory:");
		expect(() =>
			assertSchemaCompatible({ raw, close: () => raw.close() }),
		).not.toThrow();
		raw.close();
	});

	it("KNOWN_MAX_VERSION matches the highest migration file on disk", () => {
		const migrationsDir = path.resolve(
			__dirname,
			"../../src/main/db/migrations",
		);
		const versions = readdirSync(migrationsDir)
			.filter((f) => /^\d{4}-.*\.sql$/.test(f))
			.map((f) => Number.parseInt(f.slice(0, 4), 10));
		expect(KNOWN_MAX_VERSION).toBe(Math.max(...versions));
	});
});
