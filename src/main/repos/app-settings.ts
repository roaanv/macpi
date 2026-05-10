// Reads/writes app-level UI settings (theme, font, default cwd) in the
// settings_global table. Values are stored as JSON strings so anything
// JSON-serialisable round-trips. Distinct from settings/resolver.ts which
// scaffolds the (currently unused) pi-runtime cascade.

import type { DbHandle } from "../db/connection";

export class AppSettingsRepo {
	constructor(private readonly db: DbHandle) {}

	getAll(): Record<string, unknown> {
		const rows = this.db.raw
			.prepare("SELECT key, value FROM settings_global")
			.all() as unknown as Array<{ key: string; value: string }>;
		const out: Record<string, unknown> = {};
		for (const row of rows) {
			try {
				out[row.key] = JSON.parse(row.value) as unknown;
			} catch {
				out[row.key] = row.value;
			}
		}
		return out;
	}

	set(key: string, value: unknown): void {
		const json = JSON.stringify(value);
		this.db.raw
			.prepare(
				"INSERT INTO settings_global (key, value) VALUES (?, ?) " +
					"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.run(key, json);
	}
}
