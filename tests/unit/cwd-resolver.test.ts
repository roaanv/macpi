import { describe, expect, it } from "vitest";
import { resolveCwd } from "../../src/shared/cwd-resolver";

describe("resolveCwd", () => {
	it("returns the explicit override when provided", () => {
		expect(
			resolveCwd({
				override: "/explicit",
				workspaceCwd: "/workspace",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/explicit");
	});

	it("falls back to workspaceCwd when no override", () => {
		expect(
			resolveCwd({
				override: undefined,
				workspaceCwd: "/workspace",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/workspace");
	});

	it("falls back to defaultCwd when workspace cwd is null", () => {
		expect(
			resolveCwd({
				override: undefined,
				workspaceCwd: null,
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/default");
	});

	it("falls back to homeDir when default cwd is empty", () => {
		expect(
			resolveCwd({
				override: undefined,
				workspaceCwd: null,
				defaultCwd: "",
				homeDir: "/home",
			}),
		).toBe("/home");
	});

	it("treats empty-string override as no override", () => {
		expect(
			resolveCwd({
				override: "",
				workspaceCwd: "/workspace",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/workspace");
	});
});
