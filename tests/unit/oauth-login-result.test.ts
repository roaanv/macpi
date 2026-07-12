import { describe, expect, it } from "vitest";
import { getOAuthLoginResult } from "../../src/renderer/utils/oauth-login-result";
import type { OAuthEvent } from "../../src/shared/model-auth-types";

const provider = "anthropic";

describe("getOAuthLoginResult", () => {
	it("returns null when the current login has no terminal event", () => {
		const events: OAuthEvent[] = [
			{
				type: "oauth.progress",
				loginId: "current-login",
				provider,
				message: "Waiting for authentication",
			},
		];

		expect(getOAuthLoginResult(events, "current-login", null)).toBeNull();
	});

	it("returns success for the current login", () => {
		const events: OAuthEvent[] = [
			{ type: "oauth.success", loginId: "current-login", provider },
		];

		expect(getOAuthLoginResult(events, "current-login", null)).toEqual({
			kind: "success",
		});
	});

	it("returns an error preserving the current login event message", () => {
		const events: OAuthEvent[] = [
			{
				type: "oauth.error",
				loginId: "current-login",
				provider,
				message: "Authentication was rejected",
			},
		];

		expect(getOAuthLoginResult(events, "current-login", null)).toEqual({
			kind: "error",
			message: "Authentication was rejected",
		});
	});

	it("prefers the current terminal event over a start error", () => {
		const events: OAuthEvent[] = [
			{
				type: "oauth.error",
				loginId: "current-login",
				provider,
				message: "Authentication was rejected",
			},
		];
		const startError = new Error("Could not start OAuth login");

		expect(getOAuthLoginResult(events, "current-login", startError)).toEqual({
			kind: "error",
			message: "Authentication was rejected",
		});
	});

	it("ignores terminal events for another login", () => {
		const events: OAuthEvent[] = [
			{ type: "oauth.success", loginId: "other-login", provider },
			{
				type: "oauth.error",
				loginId: "other-login",
				provider,
				message: "Other login failed",
			},
		];

		expect(getOAuthLoginResult(events, "current-login", null)).toBeNull();
	});

	it("falls back to the start error when no current terminal event exists", () => {
		const events: OAuthEvent[] = [
			{ type: "oauth.success", loginId: "other-login", provider },
		];
		const startError = new Error("Could not start OAuth login");

		expect(getOAuthLoginResult(events, "current-login", startError)).toEqual({
			kind: "error",
			message: "Could not start OAuth login",
		});
	});
});
