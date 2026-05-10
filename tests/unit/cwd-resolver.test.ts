import { describe, expect, it } from "vitest";
import { resolveCwd } from "../../src/shared/cwd-resolver";

describe("resolveCwd", () => {
	it("returns the explicit override when provided", () => {
		expect(
			resolveCwd({
				override: "/explicit",
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/explicit");
	});

	it("falls back to channelCwd when no override", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/channel");
	});

	it("falls back to defaultCwd when channel cwd is null", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: null,
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/default");
	});

	it("falls back to homeDir when default cwd is empty", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: null,
				defaultCwd: "",
				homeDir: "/home",
			}),
		).toBe("/home");
	});

	it("treats empty-string override as no override", () => {
		expect(
			resolveCwd({
				override: "",
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/channel");
	});
});
