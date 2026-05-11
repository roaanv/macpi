import { describe, expect, it } from "vitest";
import { classifyError } from "../../src/main/pi-session-manager";

describe("classifyError", () => {
	it.each([
		["Authentication failed: bad token", "auth"],
		["HTTP 401 Unauthorized", "auth"],
		["403 forbidden", "auth"],
		["unauthorized request", "auth"],
		["model 'gpt-99' not found", "model"],
		["request timeout after 30s", "transient"],
		["ECONNRESET while reading response", "transient"],
		["ETIMEDOUT", "transient"],
		["something else broke", "unknown"],
		["", "unknown"],
	])("classifies %p as %p", (message, expected) => {
		expect(classifyError(message)).toBe(expected);
	});
});
