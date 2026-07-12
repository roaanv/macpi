import type { OAuthEvent } from "../../shared/model-auth-types";

export type OAuthLoginResult =
	| { kind: "success" }
	| { kind: "error"; message: string };

export function getOAuthLoginResult(
	events: OAuthEvent[],
	loginId: string | null,
	startError: Error | null,
): OAuthLoginResult | null {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event.loginId !== loginId) continue;
		if (event.type === "oauth.success") return { kind: "success" };
		if (event.type === "oauth.error") {
			return { kind: "error", message: event.message };
		}
	}

	if (startError) return { kind: "error", message: startError.message };
	return null;
}
