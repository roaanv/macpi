import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureResourceRoot } from "../../src/main/resource-root";

describe("ensureResourceRoot", () => {
	let homeDir: string;
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-home-"));
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("creates ~/.macpi when settings.resourceRoot is missing", () => {
		const root = ensureResourceRoot({}, homeDir);
		expect(root).toBe(path.join(homeDir, ".macpi"));
		expect(existsSync(root)).toBe(true);
	});

	it("creates the user's chosen dir when set", () => {
		const custom = path.join(homeDir, "custom");
		const root = ensureResourceRoot({ resourceRoot: custom }, homeDir);
		expect(root).toBe(custom);
		expect(existsSync(custom)).toBe(true);
	});

	it("no-ops when the dir already exists", () => {
		ensureResourceRoot({}, homeDir);
		expect(() => ensureResourceRoot({}, homeDir)).not.toThrow();
		expect(existsSync(path.join(homeDir, ".macpi"))).toBe(true);
	});
});
