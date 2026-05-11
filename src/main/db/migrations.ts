// Migration runner for SQLite. Tracks applied migrations in _migrations table.
// Reads .sql files from the migrations directory in version order.

import fs from "node:fs";
import path from "node:path";
import { type DbHandle, tx } from "./connection";
import { DbMigrationError } from "./errors";

export interface MigrationFile {
	version: number;
	sql: string;
}

export interface MigrationFs {
	list(): MigrationFile[];
}

const defaultFs: MigrationFs = {
	list(): MigrationFile[] {
		const dir =
			process.env.MACPI_MIGRATIONS_DIR ?? path.join(__dirname, "migrations");
		if (!fs.existsSync(dir)) return [];
		return fs
			.readdirSync(dir)
			.filter((f) => /^\d{4}-.*\.sql$/.test(f))
			.sort()
			.map((f) => ({
				version: Number.parseInt(f.slice(0, 4), 10),
				sql: fs.readFileSync(path.join(dir, f), "utf8"),
			}));
	},
};

function ensureMigrationsTable(db: DbHandle) {
	db.raw.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version  INTEGER PRIMARY KEY,
    applied  INTEGER NOT NULL
  )`);
}

export function currentVersion(db: DbHandle): number {
	ensureMigrationsTable(db);
	const row = db.raw
		.prepare("SELECT MAX(version) as v FROM _migrations")
		.get() as unknown as { v: number | null };
	return row.v ?? 0;
}

/** Apply pending migrations in order. Each migration runs in its own transaction. */
export function runMigrations(
	db: DbHandle,
	fsImpl: MigrationFs = defaultFs,
): void {
	ensureMigrationsTable(db);
	const have = currentVersion(db);
	for (const m of fsImpl.list()) {
		if (m.version <= have) continue;
		try {
			tx(db, () => {
				db.raw.exec(m.sql);
				db.raw
					.prepare("INSERT INTO _migrations (version, applied) VALUES (?, ?)")
					.run(m.version, Date.now());
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new DbMigrationError(
				`migration ${m.version} failed: ${msg}`,
				m.version,
				e,
			);
		}
	}
}
