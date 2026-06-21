import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

let homeDir: string;
let macpiRoot: string;
let agentDir: string;
let localPackageDir: string;

beforeEach(() => {
	homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-global-pi-"));
	macpiRoot = path.join(homeDir, ".macpi");
	agentDir = path.join(macpiRoot, "pi-agent");
	localPackageDir = path.join(homeDir, "fixture-package");
	fs.mkdirSync(path.join(localPackageDir, "prompts"), { recursive: true });
	fs.writeFileSync(path.join(localPackageDir, "prompts", "hello.md"), "hello");
});

afterEach(() => {
	fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("PiSessionManager MacPi package manager", () => {
	it("persists package settings under the MacPi Pi agent root", async () => {
		const manager = new PiSessionManager({
			appSettings: { getAll: () => ({}) } as never,
			agentDir,
		});
		const pm = await manager.loadPackageManager();

		await pm.installAndPersist(localPackageDir, { local: false });

		const globalSettingsPath = path.join(agentDir, "settings.json");
		expect(fs.existsSync(globalSettingsPath)).toBe(true);
		const settings = JSON.parse(
			fs.readFileSync(globalSettingsPath, "utf8"),
		) as {
			packages?: string[];
		};
		expect(settings.packages).toEqual(["../../fixture-package"]);
		expect(fs.existsSync(path.join(agentDir, "npm"))).toBe(true);
		expect(
			fs.existsSync(path.join(homeDir, ".pi", "agent", "settings.json")),
		).toBe(false);
	});
});
