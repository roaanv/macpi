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
