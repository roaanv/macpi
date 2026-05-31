import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

let homeDir: string;
let localPackageDir: string;

beforeEach(() => {
	homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-global-pi-"));
	localPackageDir = path.join(homeDir, "fixture-package");
	fs.mkdirSync(path.join(localPackageDir, "prompts"), { recursive: true });
	fs.writeFileSync(path.join(localPackageDir, "prompts", "hello.md"), "hello");
});

afterEach(() => {
	fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("PiSessionManager global package manager", () => {
	it("persists package settings under ~/.pi/agent", async () => {
		const manager = new PiSessionManager({
			appSettings: { getAll: () => ({}) } as never,
			homeDir,
		});
		const pm = await manager.loadPackageManager();

		await pm.installAndPersist(localPackageDir, { local: false });

		const globalSettingsPath = path.join(
			homeDir,
			".pi",
			"agent",
			"settings.json",
		);
		expect(fs.existsSync(globalSettingsPath)).toBe(true);
		const settings = JSON.parse(
			fs.readFileSync(globalSettingsPath, "utf8"),
		) as {
			packages?: string[];
		};
		expect(settings.packages).toEqual(["../../fixture-package"]);
		expect(fs.existsSync(path.join(homeDir, ".macpi", "settings.json"))).toBe(
			false,
		);
	});
});
