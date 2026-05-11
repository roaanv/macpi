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

// Bounds the retry loop. If the DB keeps failing this many times in a row,
// we give the user one last "Open folder or quit" dialog instead of looping
// forever on something like a disk-full or permission error.
const MAX_RECOVERY_ATTEMPTS = 5;

export async function startupWithRecovery(
	dbFile: string,
	logger: Logger,
): Promise<StartupResult> {
	let lastError: unknown = null;
	for (let attempt = 1; attempt <= MAX_RECOVERY_ATTEMPTS; attempt++) {
		try {
			const db = openDb({ filename: dbFile });
			assertSchemaCompatible(db);
			rotateBackup(dbFile);
			runMigrations(db);
			logger.info(`db ready at ${dbFile}`);
			return { db };
		} catch (e) {
			lastError = e;
			logger.error(`startup failure (attempt ${attempt}): ${describe(e)}`);
			const choice = await showRecoveryDialog(dbFile, e);
			if (choice === "quit") {
				app.exit(1);
				// app.exit is synchronous in Electron, but TS doesn't know that;
				// rethrow so the surrounding promise chain has a terminal value.
				throw e;
			}
			try {
				await applyChoice(choice, dbFile, logger);
			} catch (actionErr) {
				logger.error(
					`recovery action "${choice}" failed: ${describe(actionErr)}`,
				);
				// Fall through to the next iteration — the next dialog will show
				// the *new* failure (likely the recovery error itself when openDb
				// is retried), giving the user another choice.
			}
		}
	}
	// Last-resort dialog after MAX attempts: no auto-retry, only Open-folder + Quit.
	await showGiveUpDialog(dbFile, lastError);
	app.exit(1);
	throw lastError;
}

async function applyChoice(
	choice: Exclude<Choice, "quit">,
	dbFile: string,
	logger: Logger,
): Promise<void> {
	if (choice === "open-folder") {
		await shell.openPath(path.dirname(dbFile));
		return;
	}
	if (choice === "restore-backup") {
		const bak = `${dbFile}.bak`;
		if (!fs.existsSync(bak)) {
			logger.warn("restore-backup chosen but macpi.db.bak no longer exists");
			return;
		}
		fs.copyFileSync(bak, dbFile);
		logger.info("restored from macpi.db.bak");
		return;
	}
	// start-fresh
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	if (fs.existsSync(dbFile)) {
		fs.renameSync(dbFile, `${dbFile}.broken-${ts}`);
		logger.info(`renamed broken db to ${dbFile}.broken-${ts}`);
	}
}

function describe(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function formatDetail(err: unknown): string {
	if (err instanceof DbSchemaNewerError) {
		return "This database was written by a newer version of macpi. Update the app to continue.";
	}
	if (err instanceof DbMigrationError) {
		return `Migration ${err.version} failed: ${err.message}`;
	}
	if (err instanceof DbOpenError) {
		return `Could not open the database: ${err.message}`;
	}
	return describe(err);
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
	const { response } = await dialog.showMessageBox({
		type: "error",
		title: "macpi — database problem",
		message: "macpi could not start.",
		detail: formatDetail(err),
		buttons,
		// Default to the least destructive action (open folder) so an
		// accidental Enter doesn't quit. Esc still maps to Quit via cancelId.
		defaultId: 0,
		cancelId: buttons.length - 1,
	});
	const label = buttons[response];
	if (label === "Open data folder") return "open-folder";
	if (label === "Restore last backup") return "restore-backup";
	if (label === "Start fresh (rename old db)") return "start-fresh";
	return "quit";
}

async function showGiveUpDialog(dbFile: string, err: unknown): Promise<void> {
	await dialog.showMessageBox({
		type: "error",
		title: "macpi — giving up",
		message: `macpi could not start after ${MAX_RECOVERY_ATTEMPTS} attempts.`,
		detail: `${formatDetail(err)}\n\nThe data folder is:\n${path.dirname(dbFile)}`,
		buttons: ["Open data folder", "Quit"],
		defaultId: 0,
		cancelId: 1,
	});
}
