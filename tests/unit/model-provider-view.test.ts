import { describe, expect, it } from "vitest";
import {
	buildProviderViews,
	configuredProviderViews,
	filterModels,
	filterProviderViews,
	groupModelsByProvider,
} from "../../src/renderer/utils/model-provider-view";
import type {
	ModelSummary,
	ProviderSummary,
} from "../../src/shared/model-auth-types";

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
	{
		id: "google",
		name: "Google",
		authType: "api_key",
		authStatus: { configured: true },
		modelCount: 1,
		availableModelCount: 1,
		supportsOAuth: false,
		supportsStoredApiKey: true,
	},
];

const models: ModelSummary[] = [
	{
		provider: "anthropic",
		providerName: "Anthropic",
		id: "claude-sonnet-4",
		name: "Claude Sonnet 4",
		authConfigured: true,
		usingOAuth: false,
		reasoning: false,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 200000,
		maxTokens: 8192,
	},
	{
		provider: "codex",
		providerName: "OpenAI Codex",
		id: "gpt-5-codex",
		name: "GPT-5",
		authConfigured: false,
		usingOAuth: false,
		reasoning: true,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 200000,
		maxTokens: 8192,
	},
	{
		provider: "google",
		providerName: "Google",
		id: "gemini-pro",
		name: "Gemini Pro",
		authConfigured: true,
		usingOAuth: false,
		reasoning: false,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 1000000,
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
		expect(
			filterProviderViews(views, "configured", "").map((p) => p.id),
		).toEqual(["anthropic", "google"]);
	});

	it("filters by search text", () => {
		const views = buildProviderViews(providers, models);
		expect(filterProviderViews(views, "all", "code").map((p) => p.id)).toEqual([
			"codex",
		]);
	});

	it("filters by favourite models", () => {
		const views = buildProviderViews(providers, models);
		const favourites = new Set(["anthropic\u0000claude-sonnet-4"]);
		expect(
			filterProviderViews(views, "favourites", "", favourites).map((p) => p.id),
		).toEqual(["anthropic"]);
	});

	it("returns configured provider views in their original order", () => {
		const views = buildProviderViews(
			[providers[1], providers[2], providers[0]],
			models,
		);

		expect(
			configuredProviderViews(views).map((provider) => provider.id),
		).toEqual(["google", "anthropic"]);
	});

	it("returns a model copy for a blank search", () => {
		const result = filterModels(models, "  ");

		expect(result).toEqual(models);
		expect(result).not.toBe(models);
	});

	it.each([
		["sonnet", "claude-sonnet-4"],
		["GPT-5-CODEX", "gpt-5-codex"],
		["openai codex", "gpt-5-codex"],
	])("filters models case-insensitively by name, id, or provider", (query, id) => {
		expect(filterModels(models, query).map((model) => model.id)).toEqual([id]);
	});

	it("groups configured providers and their models in provider order", () => {
		const views = buildProviderViews(
			[providers[1], providers[2], providers[0]],
			models,
		);

		const groups = groupModelsByProvider(views);

		expect(groups.map((group) => group.provider.id)).toEqual([
			"google",
			"anthropic",
		]);
		expect(groups.map((group) => group.models)).toEqual([
			[models[2]],
			[models[0]],
		]);
	});
});
