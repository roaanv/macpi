// Known max migration version baked into this binary. Bump whenever a new
// migration file is added under src/main/db/migrations/. The open-time check
// uses this to refuse to start when the DB was written by a newer macpi.

import type { DbHandle } from "./connection";
import { DbSchemaNewerError } from "./errors";

export const KNOWN_MAX_VERSION = 5;

export function assertSchemaCompatible(db: DbHandle): void {
	// A fresh DB has no _migrations table yet — runMigrations will create
	// it. Treat that as "applied = 0", which is trivially compatible with
	// any KNOWN_MAX_VERSION. Without this guard, first-run on a new machine
	// fails with "no such table: _migrations" because the check runs
	// before runMigrations.
	const tableExists = db.raw
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
		)
		.get();
	if (!tableExists) return;

	const row = db.raw
		.prepare("SELECT MAX(version) AS v FROM _migrations")
		.get() as unknown as { v: number | null };
	const applied = row?.v ?? 0;
	if (applied > KNOWN_MAX_VERSION) {
		throw new DbSchemaNewerError(applied, KNOWN_MAX_VERSION);
	}
}
