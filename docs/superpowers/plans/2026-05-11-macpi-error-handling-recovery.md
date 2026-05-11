# Error Handling & Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the gaps in §11 of the design spec — DB recovery dialog, schema-version check, `macpi.db.bak` rotation, log file writers, pi-exception → red banner, and main-process uncaught-exception → crash log + quit.

**Architecture:** Three layers. (1) A tiny logger module writes time-stamped lines to `app.getPath('logs')/main.log` and `renderer.log` with daily rotation. (2) DB startup is wrapped in a recovery flow: `openDb`/`runMigrations` throw typed errors; main catches them and shows an Electron native dialog with *Open data folder* / *Restore backup* / *Start fresh* / *Quit*. Backups happen on every successful startup. (3) Pi exceptions surface as a new `session.error` PiEvent that the renderer renders as a red error banner. `process.on('uncaughtException' | 'unhandledRejection')` writes a crash report and quits cleanly.

**Tech Stack:** Electron 42, Node.js `node:sqlite`, `node:fs`, React 18, Vitest 3, Biome v2. No new dependencies.

---

## File Structure

**New files (main process):**
- `src/main/logger.ts` — line-oriented log file writer with daily rotation.
- `src/main/db/schema-version.ts` — exports `KNOWN_MAX_VERSION` constant + `assertSchemaCompatible(db)` helper.
- `src/main/db/backup.ts` — copies `macpi.db` → `macpi.db.bak` before migrations.
- `src/main/db/errors.ts` — typed error classes (`DbOpenError`, `DbSchemaNewerError`, `DbMigrationError`).
- `src/main/startup-recovery.ts` — orchestrates the recovery dialog and user choice.
- `src/main/crash-handler.ts` — installs `uncaughtException`/`unhandledRejection` handlers.

**New files (renderer):**
- `src/renderer/components/ErrorBanner.tsx` — red banner UI for session errors.

**Modified files:**
- `src/shared/pi-events.ts` — add `session.error` event variant.
- `src/main/db/connection.ts` — `openDb` catches sqlite errors and throws `DbOpenError`.
- `src/main/db/migrations.ts` — wraps the loop, throws `DbMigrationError` on failure.
- `src/main/pi-session-manager.ts` — translate SDK errors into `session.error`.
- `src/main/index.ts` — install crash handler + wrap startup in recovery flow.
- `src/main/ipc-router.ts` — add `system.openLogsFolder`.
- `src/shared/ipc-types.ts` — declare `system.openLogsFolder`.
- `src/renderer/state/timeline-state.ts` — add `errorBanner` field + handle `session.error`.
- `src/renderer/components/ChatPane.tsx` — render `<ErrorBanner>` when `errorBanner` present.
- `src/renderer/components/SettingsDialog.tsx` — add *Open logs folder* row.

**Test files:**
- `tests/unit/logger.test.ts`
- `tests/unit/schema-version.test.ts`
- `tests/unit/db-backup.test.ts`
- `tests/unit/timeline-state.test.ts` (extend if exists, else create) — `session.error` reducer case.
- `tests/integration/db-recovery.test.ts` — simulated migration failure produces `DbMigrationError`.

---

## Task 1: Logger module

**Files:**
- Create: `src/main/logger.ts`
- Create: `tests/unit/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logger.test.ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../src/main/logger";

describe("logger", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "macpi-log-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("writes a line to today's log file", () => {
		const log = createLogger({ dir, stream: "main", now: () => new Date("2026-05-11T10:00:00Z") });
		log.info("hello");
		log.flush();
		const file = path.join(dir, "main-2026-05-11.log");
		expect(readFileSync(file, "utf8")).toMatch(/INFO\s+hello/);
	});

	it("rotates to a new file on a new day", () => {
		let now = new Date("2026-05-11T23:59:00Z");
		const log = createLogger({ dir, stream: "main", now: () => now });
		log.info("day1");
		now = new Date("2026-05-12T00:01:00Z");
		log.info("day2");
		log.flush();
		expect(readFileSync(path.join(dir, "main-2026-05-11.log"), "utf8")).toMatch(/day1/);
		expect(readFileSync(path.join(dir, "main-2026-05-12.log"), "utf8")).toMatch(/day2/);
	});

	it("prunes files older than 7 days on init", () => {
		// Touch a stale file at day -10
		const stale = path.join(dir, "main-2026-05-01.log");
		require("node:fs").writeFileSync(stale, "old\n");
		const tenDaysOld = new Date("2026-05-01T00:00:00Z").getTime();
		require("node:fs").utimesSync(stale, tenDaysOld / 1000, tenDaysOld / 1000);
		createLogger({ dir, stream: "main", now: () => new Date("2026-05-11T10:00:00Z") });
		expect(require("node:fs").existsSync(stale)).toBe(false);
	});

	it("readRecent returns the last N lines", () => {
		const log = createLogger({ dir, stream: "main", now: () => new Date("2026-05-11T10:00:00Z") });
		for (let i = 0; i < 10; i++) log.info(`line-${i}`);
		log.flush();
		const tail = log.readRecent(3);
		expect(tail).toHaveLength(3);
		expect(tail[2]).toMatch(/line-9/);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/logger.test.ts`
Expected: FAIL with "Cannot find module '../../src/main/logger'"

- [ ] **Step 3: Implement the logger**

```ts
// src/main/logger.ts
// Line-oriented log file writer with daily rotation. Used by main + the
// in-process pi adapter. Renderer logs flow through an IPC method that
// also routes here. Crash reports include the last N lines via readRecent().

import fs from "node:fs";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";
export type LogStream = "main" | "renderer";

interface LoggerOptions {
	dir: string;
	stream: LogStream;
	now?: () => Date;
	retentionDays?: number;
}

export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	flush(): void;
	readRecent(n: number): string[];
}

function dayString(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function createLogger(opts: LoggerOptions): Logger {
	const now = opts.now ?? (() => new Date());
	const retentionDays = opts.retentionDays ?? 7;
	fs.mkdirSync(opts.dir, { recursive: true });

	// Prune files older than retentionDays.
	const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
	for (const name of fs.readdirSync(opts.dir)) {
		if (!name.startsWith(`${opts.stream}-`) || !name.endsWith(".log")) continue;
		const full = path.join(opts.dir, name);
		const stat = fs.statSync(full);
		if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
	}

	let currentDay = "";
	let fd: number | null = null;

	function ensureOpen(): { fd: number; file: string } {
		const day = dayString(now());
		if (day !== currentDay) {
			if (fd !== null) fs.closeSync(fd);
			currentDay = day;
		}
		const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
		if (fd === null || day !== currentDay) {
			fd = fs.openSync(file, "a");
		}
		return { fd, file };
	}

	function write(level: LogLevel, message: string) {
		const { fd: handle } = ensureOpen();
		const line = `${now().toISOString()} ${level.toUpperCase()} ${message}\n`;
		fs.writeSync(handle, line);
	}

	return {
		info: (m) => write("info", m),
		warn: (m) => write("warn", m),
		error: (m) => write("error", m),
		flush() {
			if (fd !== null) fs.fsyncSync(fd);
		},
		readRecent(n: number): string[] {
			const day = dayString(now());
			const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
			if (!fs.existsSync(file)) return [];
			const all = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
			return all.slice(-n);
		},
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/logger.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/logger.ts tests/unit/logger.test.ts
git commit -m "feat(logger): file logger with daily rotation + 7-day retention"
```

---

## Task 2: Wire logger into main + add renderer→main log IPC

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/renderer/ipc.ts` (or equivalent thin client)

- [ ] **Step 1: Add `system.log` to IPC contract**

Add the entry inside the `IpcMethods` interface in `src/shared/ipc-types.ts`:

```ts
"system.log": {
    req: { stream: "renderer"; level: "info" | "warn" | "error"; message: string };
    res: Record<string, never>;
};
```

- [ ] **Step 2: Add the handler in `src/main/ipc-router.ts`**

In the constructor accept a `logger: Logger` dependency. Register the method:

```ts
this.register("system.log", async (req) => {
    rendererLogger.write(req.level, `[renderer] ${req.message}`);
    return ok({});
});
```

(Use a second logger instance with `stream: "renderer"` so renderer messages go to `renderer-YYYY-MM-DD.log`. The router gets both via its constructor options.)

- [ ] **Step 3: Initialise both loggers in `src/main/index.ts`**

```ts
import { createLogger } from "./logger";
// ...
const logsDir = app.getPath("logs");
const mainLogger = createLogger({ dir: logsDir, stream: "main" });
const rendererLogger = createLogger({ dir: logsDir, stream: "renderer" });
mainLogger.info(`macpi starting; userData=${app.getPath("userData")}`);
```

Pass `mainLogger` and `rendererLogger` into `IpcRouter`'s options.

- [ ] **Step 4: Add a renderer client `logToMain(level, message)`**

In `src/renderer/ipc.ts`, add a thin wrapper that invokes `system.log`. Hook a global `window.addEventListener("error", ...)` and `unhandledrejection` listener in the renderer bootstrap that calls `logToMain("error", String(e))`. Best-effort, never throws.

- [ ] **Step 5: Smoke check**

Run: `npm run typecheck && npm run lint -- src/main src/shared src/renderer && npm run test`
Expected: typecheck clean, lint clean on edited paths, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/main/ipc-router.ts src/shared/ipc-types.ts src/renderer/ipc.ts
git commit -m "feat(logger): wire main + renderer-via-IPC log writers"
```

---

## Task 3: Schema version check

**Files:**
- Create: `src/main/db/schema-version.ts`
- Create: `tests/unit/schema-version.test.ts`
- Modify: `src/main/db/connection.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/schema-version.test.ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { assertSchemaCompatible, KNOWN_MAX_VERSION } from "../../src/main/db/schema-version";

describe("schema-version", () => {
	function makeDb(maxApplied: number) {
		const raw = new DatabaseSync(":memory:");
		raw.exec(`CREATE TABLE _migrations (version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)`);
		if (maxApplied > 0) {
			raw.prepare("INSERT INTO _migrations VALUES (?, ?)").run(maxApplied, Date.now());
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/schema-version.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement schema-version + the error class**

```ts
// src/main/db/errors.ts
export class DbOpenError extends Error {
	readonly kind = "open" as const;
	constructor(message: string, readonly cause?: unknown) {
		super(message);
	}
}

export class DbSchemaNewerError extends Error {
	readonly kind = "schema-newer" as const;
	constructor(public readonly applied: number, public readonly known: number) {
		super(`db schema version ${applied} is newer than this binary supports (${known}); update macpi.`);
	}
}

export class DbMigrationError extends Error {
	readonly kind = "migration" as const;
	constructor(message: string, public readonly version: number, readonly cause?: unknown) {
		super(message);
	}
}
```

```ts
// src/main/db/schema-version.ts
// Known max migration version baked into this binary. Bump whenever a new
// migration file is added under src/main/db/migrations/. The open-time check
// uses this to refuse to start when the DB was written by a newer macpi.

import type { DbHandle } from "./connection";
import { DbSchemaNewerError } from "./errors";

export const KNOWN_MAX_VERSION = 4; // matches highest migration file currently

export function assertSchemaCompatible(db: DbHandle): void {
	const row = db.raw
		.prepare("SELECT MAX(version) AS v FROM _migrations")
		.get() as unknown as { v: number | null };
	const applied = row?.v ?? 0;
	if (applied > KNOWN_MAX_VERSION) {
		throw new DbSchemaNewerError(applied, KNOWN_MAX_VERSION);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/schema-version.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema-version.ts src/main/db/errors.ts tests/unit/schema-version.test.ts
git commit -m "feat(db): KNOWN_MAX_VERSION + schema-newer guard"
```

---

## Task 4: Typed DB open + migration errors

**Files:**
- Modify: `src/main/db/connection.ts`
- Modify: `src/main/db/migrations.ts`
- Create: `tests/integration/db-recovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/db-recovery.test.ts
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { DbMigrationError, DbOpenError } from "../../src/main/db/errors";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/db-recovery.test.ts`
Expected: FAIL — current code throws raw `Error`, not typed errors.

- [ ] **Step 3: Wrap `openDb`**

In `src/main/db/connection.ts`, modify `openDb`:

```ts
import { DbOpenError } from "./errors";
// ...
export function openDb(options: OpenDbOptions): DbHandle {
	fs.mkdirSync(path.dirname(options.filename), { recursive: true });
	let raw: DatabaseSync;
	try {
		raw = new DatabaseSync(options.filename);
		if (options.wal !== false) raw.exec("PRAGMA journal_mode = WAL");
		raw.exec("PRAGMA foreign_keys = ON");
	} catch (e) {
		throw new DbOpenError(
			`failed to open SQLite database at ${options.filename}: ${(e as Error).message}`,
			e,
		);
	}
	return { raw, close: () => raw.close() };
}
```

- [ ] **Step 4: Wrap migration loop**

In `src/main/db/migrations.ts`, change `runMigrations`:

```ts
import { DbMigrationError } from "./errors";
// ...
export function runMigrations(db: DbHandle, fsImpl: MigrationFs = defaultFs): void {
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
			throw new DbMigrationError(
				`migration ${m.version} failed: ${(e as Error).message}`,
				m.version,
				e,
			);
		}
	}
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/integration/db-recovery.test.ts tests/unit/migrations.test.ts`
Expected: PASS (both new tests + existing migrations tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/db/connection.ts src/main/db/migrations.ts tests/integration/db-recovery.test.ts
git commit -m "feat(db): typed DbOpenError + DbMigrationError"
```

---

## Task 5: DB backup before migrations

**Files:**
- Create: `src/main/db/backup.ts`
- Create: `tests/unit/db-backup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/db-backup.test.ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rotateBackup } from "../../src/main/db/backup";

describe("db backup", () => {
	it("copies db → db.bak", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-bak-"));
		const db = path.join(dir, "macpi.db");
		writeFileSync(db, "snapshot");
		rotateBackup(db);
		const bak = path.join(dir, "macpi.db.bak");
		expect(existsSync(bak)).toBe(true);
		expect(readFileSync(bak, "utf8")).toBe("snapshot");
	});

	it("no-op when source missing (fresh install)", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-bak2-"));
		const db = path.join(dir, "macpi.db");
		expect(() => rotateBackup(db)).not.toThrow();
		expect(existsSync(path.join(dir, "macpi.db.bak"))).toBe(false);
	});

	it("overwrites previous backup (single-slot)", () => {
		const dir = mkdtempSync(path.join(tmpdir(), "macpi-bak3-"));
		const db = path.join(dir, "macpi.db");
		writeFileSync(db, "v1");
		rotateBackup(db);
		writeFileSync(db, "v2");
		rotateBackup(db);
		expect(readFileSync(path.join(dir, "macpi.db.bak"), "utf8")).toBe("v2");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/db-backup.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/db/backup.ts
// Single-slot backup. Copies macpi.db → macpi.db.bak on every successful
// startup *before* migrations run, so a bad migration can be undone by
// pointing the user at the .bak file from the recovery dialog.

import fs from "node:fs";

export function rotateBackup(dbFile: string): void {
	if (!fs.existsSync(dbFile)) return;
	fs.copyFileSync(dbFile, `${dbFile}.bak`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/db-backup.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/db/backup.ts tests/unit/db-backup.test.ts
git commit -m "feat(db): single-slot backup rotation"
```

---

## Task 6: Startup recovery flow

**Files:**
- Create: `src/main/startup-recovery.ts`
- Modify: `src/main/index.ts`

This step wires everything together. No new test file — verified via manual smoke in Task 13.

- [ ] **Step 1: Implement the recovery dispatcher**

```ts
// src/main/startup-recovery.ts
// Orchestrates DB startup with recovery. Called once from main entry.
// Catches DbOpenError, DbSchemaNewerError, DbMigrationError; shows an
// Electron dialog; performs the user's chosen recovery action.

import fs from "node:fs";
import path from "node:path";
import { app, dialog, shell } from "electron";
import { openDb, type DbHandle } from "./db/connection";
import { rotateBackup } from "./db/backup";
import { DbMigrationError, DbOpenError, DbSchemaNewerError } from "./db/errors";
import { runMigrations } from "./db/migrations";
import { assertSchemaCompatible } from "./db/schema-version";
import type { Logger } from "./logger";

export interface StartupResult {
	db: DbHandle;
}

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
				if (fs.existsSync(dbFile)) fs.renameSync(dbFile, `${dbFile}.broken-${ts}`);
				logger.info(`renamed broken db to ${dbFile}.broken-${ts}`);
				continue;
			}
		}
	}
}

type Choice = "open-folder" | "restore-backup" | "start-fresh" | "quit";

async function showRecoveryDialog(dbFile: string, err: unknown): Promise<Choice> {
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
```

- [ ] **Step 2: Replace the inline open/migrate in `src/main/index.ts`**

Replace:

```ts
const db = openDb({ filename: dbPath });
runMigrations(db);
```

with:

```ts
const { db } = await startupWithRecovery(dbPath, mainLogger);
```

(`app.whenReady().then(async () => { ... })` already supports await.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean, all tests pass (no new tests added — manual smoke handles this).

- [ ] **Step 4: Commit**

```bash
git add src/main/startup-recovery.ts src/main/index.ts
git commit -m "feat(db): startup recovery dialog with restore/fresh/quit"
```

---

## Task 7: Add `session.error` PiEvent

**Files:**
- Modify: `src/shared/pi-events.ts`
- Modify: `src/main/pi-session-manager.ts`

- [ ] **Step 1: Add the event type**

In `src/shared/pi-events.ts`, add a new variant to the union:

```ts
| {
        type: "session.error";
        piSessionId: string;
        code: "auth" | "model" | "transient" | "unknown";
        message: string;
    }
```

- [ ] **Step 2: Wrap the SDK turn boundary**

In `src/main/pi-session-manager.ts`, find `prompt()`. The SDK's `session.prompt` returns a promise that may reject for non-retryable failures. Wrap it:

```ts
async prompt(piSessionId: string, text: string, streamingBehavior?: "steer" | "followUp"): Promise<void> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    try {
        await active.session.prompt(text, { source: "interactive", streamingBehavior });
    } catch (e) {
        const message = (e as Error).message ?? String(e);
        const code = classifyError(message);
        this.emit({ type: "session.error", piSessionId, code, message });
        // Do NOT re-throw — the IPC handler treats the user-facing error as the banner;
        // the call itself succeeds at the IPC layer (the prompt was delivered to pi).
    }
}

function classifyError(message: string): "auth" | "model" | "transient" | "unknown" {
    const lower = message.toLowerCase();
    if (lower.includes("auth") || lower.includes("401") || lower.includes("403")) return "auth";
    if (lower.includes("model") && lower.includes("not found")) return "model";
    if (lower.includes("timeout") || lower.includes("econnreset")) return "transient";
    return "unknown";
}
```

(`this.emit` is the existing event broadcast helper. If it has a different name, look it up in the same file — it's the one used by `translate()`.)

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npx biome check --error-on-warnings src/main/pi-session-manager.ts src/shared/pi-events.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/pi-session-manager.ts src/shared/pi-events.ts
git commit -m "feat(pi): session.error event for non-retryable failures"
```

---

## Task 8: Renderer handles `session.error`

**Files:**
- Modify: `src/renderer/state/timeline-state.ts`

- [ ] **Step 1: Extend the snapshot type**

Add to the `TimelineSnapshot` interface in `src/renderer/state/timeline-state.ts`:

```ts
errorBanner: { code: "auth" | "model" | "transient" | "unknown"; message: string } | null;
```

Initialise it to `null` in the initial state object.

- [ ] **Step 2: Handle the event in the reducer**

In the reducer's switch statement, add:

```ts
case "session.error":
    return {
        ...prev,
        errorBanner: { code: event.code, message: event.message },
        streaming: false,
    };
```

Also clear `errorBanner` on `session.turn_start` (a new turn means the user has retried):

```ts
case "session.turn_start":
    return { ...prev, errorBanner: null, streaming: true };
```

(If the existing `turn_start` case already exists, edit it — don't duplicate.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run test`
Expected: clean + all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/state/timeline-state.ts
git commit -m "feat(renderer): timeline-state errorBanner field"
```

---

## Task 9: ErrorBanner component

**Files:**
- Create: `src/renderer/components/ErrorBanner.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/renderer/components/ErrorBanner.tsx
// Red banner rendered above the composer when a non-retryable pi error
// has been surfaced. Auth errors get an "Open settings" action; everything
// else just shows the code + message.

import React from "react";

interface ErrorBannerProps {
	code: "auth" | "model" | "transient" | "unknown";
	message: string;
	onOpenSettings?: () => void;
	onDismiss?: () => void;
}

export function ErrorBanner({ code, message, onOpenSettings, onDismiss }: ErrorBannerProps) {
	return (
		<div className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
			<span className="font-semibold uppercase tracking-wide text-[10px] text-red-300">
				{code}
			</span>
			<span className="flex-1 whitespace-pre-wrap">{message}</span>
			{code === "auth" && onOpenSettings && (
				<button
					type="button"
					onClick={onOpenSettings}
					className="rounded border border-red-400/50 px-2 py-0.5 text-xs hover:bg-red-500/20"
				>
					Open settings
				</button>
			)}
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					className="rounded px-1 text-red-300 hover:text-red-100"
				>
					×
				</button>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Render it in `ChatPane`**

Locate the place where retry banners render in `ChatPane.tsx`. Render `<ErrorBanner>` adjacent (above the composer, below the timeline) when `snapshot.errorBanner` is non-null. Wire `onOpenSettings` to open the existing SettingsDialog; wire `onDismiss` to a local state that hides it until the next event.

- [ ] **Step 3: Smoke check**

Run: `npm run typecheck && npm run lint -- src/renderer/components/ErrorBanner.tsx src/renderer/components/ChatPane.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ErrorBanner.tsx src/renderer/components/ChatPane.tsx
git commit -m "feat(renderer): ErrorBanner for non-retryable session errors"
```

---

## Task 10: Crash handler for main process

**Files:**
- Create: `src/main/crash-handler.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Implement**

```ts
// src/main/crash-handler.ts
// Installs process-level handlers that turn uncaught exceptions into a
// crash report file + a blocking error dialog + a clean quit. There is
// no auto-respawn — Electron's --relaunch is appropriate if needed.

import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import type { Logger } from "./logger";

export function installCrashHandler(logger: Logger, logsDir: string): void {
	const handler = (kind: "uncaught" | "rejection", err: unknown) => {
		const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
		const recent = logger.readRecent(200).join("\n");
		const ts = new Date().toISOString().replace(/[:.]/g, "-");
		const file = path.join(logsDir, `crash-${ts}.log`);
		const body = `kind: ${kind}\ntime: ${new Date().toISOString()}\n\n--- stack ---\n${stack}\n\n--- last 200 log lines ---\n${recent}\n`;
		try {
			fs.writeFileSync(file, body);
		} catch {
			// Last-ditch — if disk is broken, we just lose the report.
		}
		logger.error(`crash (${kind}): ${stack.split("\n")[0]}`);
		logger.flush();
		dialog.showErrorBox(
			"macpi crashed",
			`An unexpected error occurred and macpi must close.\n\nA crash report was written to:\n${file}`,
		);
		app.quit();
	};

	process.on("uncaughtException", (e) => handler("uncaught", e));
	process.on("unhandledRejection", (e) => handler("rejection", e));
}
```

- [ ] **Step 2: Wire it in `src/main/index.ts`**

At the very top of the `app.whenReady().then(async () => { ... })` callback (before `openDb`), call:

```ts
installCrashHandler(mainLogger, logsDir);
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/crash-handler.ts src/main/index.ts
git commit -m "feat(main): uncaughtException → crash report + dialog + quit"
```

---

## Task 11: Settings → Open logs folder

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/components/SettingsDialog.tsx`

- [ ] **Step 1: Add IPC method**

In `IpcMethods`:

```ts
"system.openLogsFolder": {
    req: Record<string, never>;
    res: Record<string, never>;
};
```

- [ ] **Step 2: Register handler**

In `src/main/ipc-router.ts`, register:

```ts
this.register("system.openLogsFolder", async () => {
    await shell.openPath(app.getPath("logs"));
    return ok({});
});
```

- [ ] **Step 3: Add the link in SettingsDialog**

Add a new row in the existing settings dialog (under whichever category fits — `Defaults` is fine):

```tsx
<button
    type="button"
    onClick={() => void invokeIpc("system.openLogsFolder", {})}
    className="text-blue-400 hover:underline"
>
    Open logs folder
</button>
```

(Use the actual ipc client name from the codebase; the renderer surely already imports it.)

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint -- src/main/ipc-router.ts src/renderer/components/SettingsDialog.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-types.ts src/main/ipc-router.ts src/renderer/components/SettingsDialog.tsx
git commit -m "feat(settings): Open logs folder link"
```

---

## Task 12: Final gates

**Files:** none.

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npx biome check --error-on-warnings src/ tests/ && npm run test`
Expected: typecheck clean, lint clean on `src/` and `tests/`, all tests pass (existing 133 + new ~10).

- [ ] **Step 2: Smoke test (manual)**

1. Launch app. Verify a `main-YYYY-MM-DD.log` file is created in `app.getPath('logs')` and contains a startup line.
2. Open Settings → click *Open logs folder*. Finder should open the folder.
3. Trigger a deliberate DB error: quit, replace `~/Library/Application Support/macpi/macpi.db` with a text file, relaunch. Recovery dialog should appear with all four buttons. Click *Start fresh* → app launches with empty DB; the broken file should be renamed `macpi.db.broken-<ts>`.
4. Trigger a deliberate pi error: in a session, send a prompt that will fail auth (e.g., temporarily move `~/.pi/agent/auth.json`). A red ErrorBanner should appear with code `auth` and an *Open settings* button.
5. Restart with `auth.json` restored; verify no banner.

---

## Self-Review

**Spec coverage:** Each §11 row is implemented:
- Pi exception during turn → Task 7 + 8 + 9
- Uncaught exception in main → Task 10
- Pi SDK transient (existing retry banner) → already done, kept
- Pi SDK non-retryable → Task 9 (ErrorBanner)
- Provider auth failure → Task 9 (auth case in classifyError + auth action in banner)
- Codex OAuth expiry → covered by auth code path
- SQLite open failure → Task 4 + 6
- SQLite per-call failure → already covered by existing `IpcResult` pattern; no new work
- Migration failure → Task 4 + 6
- Schema newer than binary → Task 3 + 6
- IPC desync → already covered by existing envelope
- §11.1 Backups → Task 5
- §11.2 Logging → Task 1 + 2 + Task 11 (Open logs folder)

**Placeholder scan:** None — every step has the actual code or the exact instruction.

**Type consistency:**
- `DbOpenError`/`DbSchemaNewerError`/`DbMigrationError` (defined Task 3, used Tasks 4, 6) ✓
- `Logger` interface (defined Task 1, used Tasks 2, 6, 10) ✓
- `KNOWN_MAX_VERSION` (defined Task 3, used Task 6 implicitly via `assertSchemaCompatible`) ✓
- `session.error` PiEvent (defined Task 7, consumed Task 8, rendered Task 9) ✓
- `startupWithRecovery` returns `{ db }` (Task 6, called from index.ts) ✓
- `errorBanner` field on `TimelineSnapshot` (Task 8, rendered Task 9) ✓
- `classifyError` helper produces codes `"auth" | "model" | "transient" | "unknown"` — matches `session.error.code` and `ErrorBanner.code` ✓
