// Orchestrates DB startup with recovery. Called once from main entry.
// Catches DbOpenError, DbSchemaNewerError, DbMigrationError; shows an
// Electron dialog; performs the user's chosen recovery action and retries
// until the DB opens cleanly or the user quits.

import fs from "node:fs";
import path from "node:path";
import { app, dialog, shell } from "electron";
import { rotateBackup } from "./db/backup";
import { type DbHandle, openDb } from "./db/connection";
import { DbMigrationError, DbOpenError, DbSchemaNewerError } from "./db/errors";
import { runMigrations } from "./db/migrations";
import { assertSchemaCompatible } from "./db/schema-version";
import type { Logger } from "./logger";

export interface StartupResult {
	db: DbHandle;
}

type Choice = "open-folder" | "restore-backup" | "start-fresh" | "quit";

export async function startupWithRecovery(
	dbFile: string,
	logger: Logger,
): Promise<StartupResult> {
	while (true) {
		try {
			const db = openDb({ filename: dbFile });
			assertSchemaCompatible(db);
			rotateBackup(dbFile);
			runMigrations(db);
			logger.info(`db ready at ${dbFile}`);
			return { db };
		} catch (e) {
			logger.error(`startup failure: ${(e as Error).message}`);
			const choice = await showRecoveryDialog(dbFile, e);
			if (choice === "quit") {
				app.quit();
				throw e;
			}
			if (choice === "open-folder") {
				await shell.openPath(path.dirname(dbFile));
				continue;
			}
			if (choice === "restore-backup") {
				const bak = `${dbFile}.bak`;
				if (fs.existsSync(bak)) {
					fs.copyFileSync(bak, dbFile);
					logger.info("restored from macpi.db.bak");
				}
				continue;
			}
			if (choice === "start-fresh") {
				const ts = new Date().toISOString().replace(/[:.]/g, "-");
				if (fs.existsSync(dbFile)) {
					fs.renameSync(dbFile, `${dbFile}.broken-${ts}`);
					logger.info(`renamed broken db to ${dbFile}.broken-${ts}`);
				}
			}
		}
	}
}

async function showRecoveryDialog(
	dbFile: string,
	err: unknown,
): Promise<Choice> {
	const bakExists = fs.existsSync(`${dbFile}.bak`);
	const buttons = [
		"Open data folder",
		...(bakExists ? ["Restore last backup"] : []),
		"Start fresh (rename old db)",
		"Quit",
	];
	const detail =
		err instanceof DbSchemaNewerError
			? "This database was written by a newer version of macpi. Update the app to continue."
			: err instanceof DbMigrationError
				? `Migration ${err.version} failed: ${err.message}`
				: err instanceof DbOpenError
					? `Could not open the database: ${err.message}`
					: String(err);
	const { response } = await dialog.showMessageBox({
		type: "error",
		title: "macpi — database problem",
		message: "macpi could not start.",
		detail,
		buttons,
		defaultId: buttons.length - 1,
		cancelId: buttons.length - 1,
	});
	const label = buttons[response];
	if (label === "Open data folder") return "open-folder";
	if (label === "Restore last backup") return "restore-backup";
	if (label === "Start fresh (rename old db)") return "start-fresh";
	return "quit";
}
