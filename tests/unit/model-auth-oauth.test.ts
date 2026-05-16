import { describe, expect, it } from "vitest";
import { ModelAuthService } from "../../src/main/model-auth-service";
import type { OAuthEvent } from "../../src/shared/model-auth-types";

function fakeModelRegistry() {
	return {
		getAll: () => [],
		getAvailable: () => [],
		getError: () => undefined,
		refresh: () => {},
		find: () => undefined,
		getProviderAuthStatus: () => ({ configured: false }),
		getProviderDisplayName: (provider: string) => provider,
		hasConfiguredAuth: () => false,
		isUsingOAuth: () => false,
	};
}

describe("ModelAuthService OAuth", () => {
	it("emits auth/progress/prompt/success events and resolves prompt responses", async () => {
		const events: OAuthEvent[] = [];
		let promptValue = "";
		let refreshed = false;
		const service = new ModelAuthService({
			macpiRoot: "/tmp/macpi-oauth-test",
			loadPi: async () => ({
				AuthStorage: {
					create: () => ({
						login: async (_provider: string, callbacks: any) => {
							callbacks.onAuth({ url: "https://auth.example", instructions: "Go" });
							callbacks.onProgress?.("Waiting");
							promptValue = await callbacks.onPrompt({ message: "Code?", placeholder: "123" });
						},
						reload: () => {},
						list: () => [],
						getOAuthProviders: () => [],
						getAuthStatus: () => ({ configured: false }),
						drainErrors: () => [],
					}),
				},
				ModelRegistry: {
					create: () => ({ ...fakeModelRegistry(), refresh: () => { refreshed = true; } }),
				},
			}),
		});
		service.onOAuthEvent((event) => events.push(event));

		const { loginId } = await service.startOAuthLogin("anthropic");
		await waitFor(() => events.some((event) => event.type === "oauth.prompt"));
		const prompt = events.find((event) => event.type === "oauth.prompt");
		if (!prompt || prompt.type !== "oauth.prompt") throw new Error("missing prompt");

		service.respondOAuthPrompt(loginId, prompt.promptId, "abc123");
		await waitFor(() => events.some((event) => event.type === "oauth.success"));

		expect(promptValue).toBe("abc123");
		expect(refreshed).toBe(true);
		expect(events.map((event) => event.type)).toContain("oauth.authUrl");
		expect(events.map((event) => event.type)).toContain("oauth.progress");
		expect(events.map((event) => event.type)).toContain("oauth.success");
	});

	it("cancels pending login sessions", async () => {
		const events: OAuthEvent[] = [];
		const service = new ModelAuthService({
			macpiRoot: "/tmp/macpi-oauth-test",
			loadPi: async () => ({
				AuthStorage: {
					create: () => ({
						login: async (_provider: string, callbacks: any) => {
							await callbacks.onPrompt({ message: "Code?" });
						},
						reload: () => {},
						list: () => [],
						getOAuthProviders: () => [],
						getAuthStatus: () => ({ configured: false }),
						drainErrors: () => [],
					}),
				},
				ModelRegistry: { create: () => fakeModelRegistry() },
			}),
		});
		service.onOAuthEvent((event) => events.push(event));

		const { loginId } = await service.startOAuthLogin("anthropic");
		await waitFor(() => events.some((event) => event.type === "oauth.prompt"));
		service.cancelOAuthLogin(loginId);

		expect(events.some((event) => event.type === "oauth.cancelled")).toBe(true);
	});
});

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let i = 0; i < 50; i++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("timed out waiting for condition");
}
