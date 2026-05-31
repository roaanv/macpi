import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ensureGlobalPiAgentRoot,
	getGlobalPiAgentRoot,
} from "../../src/main/pi-agent-root";

let homeDir: string;

beforeEach(async () => {
	homeDir = await mkdtemp(path.join(os.tmpdir(), "macpi-pi-root-"));
});

afterEach(() => {
	rmSync(homeDir, { recursive: true, force: true });
});

describe("global Pi agent root", () => {
	it("resolves to ~/.pi/agent", () => {
		expect(getGlobalPiAgentRoot(homeDir)).toBe(
			path.join(homeDir, ".pi", "agent"),
		);
	});

	it("ensures the global Pi root exists", () => {
		const root = ensureGlobalPiAgentRoot(homeDir);
		expect(root).toBe(path.join(homeDir, ".pi", "agent"));
		expect(existsSync(root)).toBe(true);
	});
});
