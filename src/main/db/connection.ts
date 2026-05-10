import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface DbHandle {
	raw: DatabaseSync;
	close: () => void;
}

export interface OpenDbOptions {
	/** Absolute path to the SQLite file. */
	filename: string;
	/** Whether to enable WAL (default true). */
	wal?: boolean;
}

export function openDb(options: OpenDbOptions): DbHandle {
	fs.mkdirSync(path.dirname(options.filename), { recursive: true });
	const raw = new DatabaseSync(options.filename);
	if (options.wal !== false) {
		raw.exec("PRAGMA journal_mode = WAL");
	}
	raw.exec("PRAGMA foreign_keys = ON");
	return {
		raw,
		close: () => {
			raw.close();
		},
	};
}

/** Run `fn` inside a transaction. Re-throws on failure (caller wraps). */
export function tx<T>(db: DbHandle, fn: (db: DbHandle) => T): T {
	db.raw.exec("BEGIN");
	try {
		const result = fn(db);
		db.raw.exec("COMMIT");
		return result;
	} catch (e) {
		db.raw.exec("ROLLBACK");
		throw e;
	}
}
