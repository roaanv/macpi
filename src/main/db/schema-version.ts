// Known max migration version baked into this binary. Bump whenever a new
// migration file is added under src/main/db/migrations/. The open-time check
// uses this to refuse to start when the DB was written by a newer macpi.

import type { DbHandle } from "./connection";
import { DbSchemaNewerError } from "./errors";

export const KNOWN_MAX_VERSION = 4;

export function assertSchemaCompatible(db: DbHandle): void {
	const row = db.raw
		.prepare("SELECT MAX(version) AS v FROM _migrations")
		.get() as unknown as { v: number | null };
	const applied = row?.v ?? 0;
	if (applied > KNOWN_MAX_VERSION) {
		throw new DbSchemaNewerError(applied, KNOWN_MAX_VERSION);
	}
}
