import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/main/db/migrations";
import { ExtensionsService } from "../../src/main/extensions-service";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";

function makeDb() {
	const raw = new DatabaseSync(":memory:");
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	const handle = { raw, close: () => raw.close() };
	runMigrations(handle);
	return handle;
}

describe("ExtensionsService", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-ext-"));
		mkdirSync(path.join(dir, ".macpi/extensions"), { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function makeService(opts: { enabled?: Record<string, boolean> }) {
		const db = makeDb();
		const appSettings = new AppSettingsRepo(db);
		if (opts.enabled) appSettings.set("resourceEnabled", opts.enabled);
		appSettings.set("resourceRoot", path.join(dir, ".macpi"));
		return new ExtensionsService({
			appSettings,
			homeDir: dir,
			loadExtensions: async () => ({
				extensions: [
					{
						path: "a.ts",
						resolvedPath: path.join(dir, ".macpi/extensions/a.ts"),
						sourceInfo: { source: "local" },
					},
					{
						path: "b.ts",
						resolvedPath: path.join(dir, ".macpi/extensions/b.ts"),
						sourceInfo: { source: "local" },
					},
				],
				errors: [{ path: "broken.ts", error: "Parse error: unexpected token" }],
			}),
			loadPackageManager: () => {
				throw new Error("not exercised");
			},
			emitEvent: () => undefined,
			runBiome: () => Promise.resolve([]),
		});
	}

	it("list returns enabled flags + loadErrors", async () => {
		const svc = makeService({
			enabled: {
				"extension:local:a.ts": true,
				"extension:local:b.ts": false,
			},
		});
		const result = await svc.list();
		expect(result.extensions.map((e) => [e.name, e.enabled])).toEqual([
			["a.ts", true],
			["b.ts", false],
		]);
		expect(result.loadErrors).toEqual([
			{ path: "broken.ts", error: "Parse error: unexpected token" },
		]);
	});

	it("list treats missing entries as enabled", async () => {
		const svc = makeService({});
		const result = await svc.list();
		expect(result.extensions.every((e) => e.enabled)).toBe(true);
	});

	it("read returns the entry file body", async () => {
		writeFileSync(
			path.join(dir, ".macpi/extensions/a.ts"),
			"export default () => {}",
		);
		const svc = makeService({});
		const result = await svc.list();
		const detail = await svc.read(result.extensions[0].id);
		expect(detail.body).toBe("export default () => {}");
		expect(detail.manifest.name).toBe("a.ts");
	});

	it("read throws on unknown id", async () => {
		const svc = makeService({});
		await expect(svc.read("extension:local:nope.ts")).rejects.toThrow();
	});
});
