import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	__setSpawnerForTesting,
	runBiomeCheck,
} from "../../src/main/biome-runner";

describe("runBiomeCheck", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-biome-"));
	});
	afterEach(() => {
		__setSpawnerForTesting(null);
		rmSync(dir, { recursive: true, force: true });
	});

	it("parses Biome JSON diagnostics into ExtensionDiagnostic[]", async () => {
		__setSpawnerForTesting(() =>
			Promise.resolve({
				stdout: JSON.stringify({
					diagnostics: [
						{
							severity: "warning",
							message: { content: [{ content: "Unused variable" }] },
							location: { span: { start: { line: 2, column: 5 } } },
							category: "lint/correctness/noUnusedVariables",
						},
					],
				}),
				stderr: "",
				code: 0,
			}),
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "const x = 1;\n");
		const diags = await runBiomeCheck(file);
		expect(diags).toEqual([
			expect.objectContaining({
				severity: "warn",
				line: 2,
				column: 5,
				message: "Unused variable",
				rule: "lint/correctness/noUnusedVariables",
			}),
		]);
	});

	it("returns a single error diagnostic on timeout", async () => {
		__setSpawnerForTesting(
			() => new Promise(() => undefined), // never resolves
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "");
		const diags = await runBiomeCheck(file, 50);
		expect(diags).toHaveLength(1);
		expect(diags[0]).toEqual(
			expect.objectContaining({
				severity: "error",
				message: expect.stringMatching(/timeout/i),
			}),
		);
	});

	it("returns a single error diagnostic on non-JSON stdout", async () => {
		__setSpawnerForTesting(() =>
			Promise.resolve({ stdout: "not json", stderr: "", code: 0 }),
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "");
		const diags = await runBiomeCheck(file);
		expect(diags).toHaveLength(1);
		expect(diags[0].severity).toBe("error");
	});
});
