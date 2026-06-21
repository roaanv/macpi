import { existsSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ensureMacPiPiAgentRoot,
	getMacPiPiAgentRoot,
} from "../../src/main/pi-agent-root";

let macpiRoot: string;

beforeEach(async () => {
	macpiRoot = await mkdtemp(path.join(os.tmpdir(), "macpi-pi-root-"));
});

afterEach(() => {
	rmSync(macpiRoot, { recursive: true, force: true });
});

describe("MacPi Pi agent root", () => {
	it("resolves to <macpiRoot>/pi-agent", () => {
		expect(getMacPiPiAgentRoot(macpiRoot)).toBe(
			path.join(macpiRoot, "pi-agent"),
		);
	});

	it("ensures the MacPi Pi root exists", () => {
		const root = ensureMacPiPiAgentRoot(macpiRoot);
		expect(root).toBe(path.join(macpiRoot, "pi-agent"));
		expect(existsSync(root)).toBe(true);
	});
});
