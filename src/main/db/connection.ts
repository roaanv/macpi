import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DbOpenError } from "./errors";

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
	let raw: DatabaseSync;
	try {
		raw = new DatabaseSync(options.filename);
		if (options.wal !== false) {
			raw.exec("PRAGMA journal_mode = WAL");
		}
		raw.exec("PRAGMA foreign_keys = ON");
	} catch (e) {
		throw new DbOpenError(
			`failed to open SQLite database at ${options.filename}: ${(e as Error).message}`,
			e,
		);
	}
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
