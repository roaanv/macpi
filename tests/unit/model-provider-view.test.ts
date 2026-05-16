import { describe, expect, it } from "vitest";
import type { ModelSummary, ProviderSummary } from "../../src/shared/model-auth-types";
import { buildProviderViews, filterProviderViews } from "../../src/renderer/utils/model-provider-view";

const providers: ProviderSummary[] = [
	{
		id: "anthropic",
		name: "Anthropic",
		authType: "api_key",
		authStatus: { configured: true },
		modelCount: 2,
		availableModelCount: 2,
		supportsOAuth: false,
		supportsStoredApiKey: true,
	},
	{
		id: "codex",
		name: "Codex",
		authType: "oauth",
		authStatus: { configured: false },
		modelCount: 1,
		availableModelCount: 0,
		supportsOAuth: true,
		supportsStoredApiKey: false,
	},
];

const models: ModelSummary[] = [
	{
		provider: "anthropic",
		providerName: "Anthropic",
		id: "claude",
		name: "Claude",
		authConfigured: true,
		usingOAuth: false,
		reasoning: false,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 200000,
		maxTokens: 8192,
	},
];

describe("model provider view helpers", () => {
	it("builds cloud provider views with initials and model lists", () => {
		const views = buildProviderViews(providers, models);
		expect(views[0]).toMatchObject({
			id: "anthropic",
			initials: "AN",
			kind: "cloud",
			models: [models[0]],
		});
	});

	it("filters by configured status", () => {
		const views = buildProviderViews(providers, models);
		expect(filterProviderViews(views, "configured", "").map((p) => p.id)).toEqual([
			"anthropic",
		]);
	});

	it("filters by search text", () => {
		const views = buildProviderViews(providers, models);
		expect(filterProviderViews(views, "all", "code").map((p) => p.id)).toEqual([
			"codex",
		]);
	});
});
