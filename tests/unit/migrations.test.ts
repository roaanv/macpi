import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { currentVersion, runMigrations } from "../../src/main/db/migrations";

let dir: string;
let db: DbHandle;

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-mig-"));
	db = openDb({ filename: path.join(dir, "test.db") });
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
	it("starts at version 0 and applies all migrations", () => {
		expect(currentVersion(db)).toBe(0);
		runMigrations(db);
		expect(currentVersion(db)).toBe(6);
	});

	it("is idempotent on re-run", () => {
		runMigrations(db);
		runMigrations(db);
		expect(currentVersion(db)).toBe(6);
	});

	it("creates the workspaces table", () => {
		runMigrations(db);
		const row = db.raw
			.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'",
			)
			.get() as { name: string } | undefined;
		expect(row?.name).toBe("workspaces");
	});

	it("rolls back the transaction on a failing migration", () => {
		const fakeFs = {
			list: () => [
				{ version: 1, sql: "CREATE TABLE good (a INT);" },
				{ version: 2, sql: "CREATE TABLE bad (this is not sql);" },
			],
		};
		expect(() => runMigrations(db, fakeFs)).toThrow();
		const row = db.raw
			.prepare("SELECT name FROM sqlite_master WHERE name='good'")
			.get();
		expect(row).toBeTruthy();
		expect(currentVersion(db)).toBe(1);
	});

	it("002 adds cwd and session_file_path columns to workspace_sessions", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = (
			memDb.raw
				.prepare("PRAGMA table_info(workspace_sessions)")
				.all() as unknown as Array<{ name: string }>
		).map((c) => c.name);
		expect(cols).toContain("cwd");
		expect(cols).toContain("session_file_path");
		memDb.close();
	});

	it("003 adds label and label_user_set columns to workspace_sessions", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = memDb.raw
			.prepare("PRAGMA table_info(workspace_sessions)")
			.all() as unknown as Array<{ name: string; dflt_value: unknown }>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("label");
		expect(colNames).toContain("label_user_set");
		const flag = cols.find((c) => c.name === "label_user_set");
		expect(flag?.dflt_value).toBe("0");
		memDb.close();
	});

	it("004 cwd survives the workspace migration", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = memDb.raw
			.prepare("PRAGMA table_info(workspaces)")
			.all() as unknown as Array<{ name: string }>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("cwd");
		memDb.close();
	});

	it("006 renames legacy tables and preserves workspace data", () => {
		const migrationDir = process.env.MACPI_MIGRATIONS_DIR as string;
		const readMigrations = () =>
			fs
				.readdirSync(migrationDir)
				.filter((file) => /^\d{4}-.*\.sql$/.test(file))
				.sort()
				.map((file) => ({
					version: Number.parseInt(file.slice(0, 4), 10),
					sql: fs.readFileSync(path.join(migrationDir, file), "utf8"),
				}));
		runMigrations(db, {
			list: () =>
				readMigrations().filter((migration) => migration.version <= 5),
		});
		db.raw
			.prepare(
				"INSERT INTO channels (id, name, position, icon, created_at, cwd) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run("legacy", "Legacy workspace", 0, null, 1, "/legacy");
		db.raw
			.prepare(
				"INSERT INTO channel_sessions (channel_id, pi_session_id, position, added_at, cwd) VALUES (?, ?, ?, ?, ?)",
			)
			.run("legacy", "session-1", 0, 1, "/legacy");
		db.raw
			.prepare(
				"INSERT INTO settings_channel (channel_id, key, value) VALUES (?, ?, ?)",
			)
			.run("legacy", "thinkingLevel", '"medium"');

		runMigrations(db, { list: readMigrations });

		expect(
			db.raw
				.prepare("SELECT name, cwd FROM workspaces WHERE id = ?")
				.get("legacy"),
		).toEqual({ name: "Legacy workspace", cwd: "/legacy" });
		expect(
			db.raw
				.prepare(
					"SELECT workspace_id AS workspaceId FROM workspace_sessions WHERE pi_session_id = ?",
				)
				.get("session-1"),
		).toEqual({ workspaceId: "legacy" });
		expect(
			db.raw
				.prepare(
					"SELECT workspace_id AS workspaceId, value FROM settings_workspace WHERE key = ?",
				)
				.get("thinkingLevel"),
		).toEqual({ workspaceId: "legacy", value: '"medium"' });
		const indexes = db.raw
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'workspace_sessions' ORDER BY name",
			)
			.all() as unknown as Array<{ name: string }>;
		expect(indexes.map((index) => index.name)).toEqual(
			expect.arrayContaining([
				"idx_workspace_sessions_parent",
				"idx_workspace_sessions_session",
			]),
		);
	});
});
