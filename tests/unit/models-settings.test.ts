// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configuredProviders = [
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

const unconfiguredProvider = {
	id: "openai",
	name: "OpenAI",
	authType: "api_key",
	authStatus: { configured: false },
	modelCount: 1,
	availableModelCount: 0,
	supportsOAuth: false,
	supportsStoredApiKey: true,
};

const customProvider = {
	id: "custom-openai",
	name: "Custom OpenAI",
	authType: "api_key",
	authStatus: { configured: false },
	modelCount: 0,
	availableModelCount: 0,
	supportsOAuth: false,
	supportsStoredApiKey: true,
};

const allModels = [
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
		provider: "anthropic",
		providerName: "Anthropic",
		id: "claude-opus-4",
		name: "Claude Opus 4",
		authConfigured: true,
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
		id: "gemini-2.5-pro",
		name: "Gemini Pro",
		authConfigured: true,
		usingOAuth: false,
		reasoning: true,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 1000000,
		maxTokens: 8192,
	},
	{
		provider: "openai",
		providerName: "OpenAI",
		id: "gpt-5",
		name: "GPT-5",
		authConfigured: false,
		usingOAuth: false,
		reasoning: true,
		thinkingLevels: [],
		input: ["text"],
		contextWindow: 200000,
		maxTokens: 8192,
	},
];

const mocks = vi.hoisted(() => ({
	providers: {
		data: { providers: [] as Array<Record<string, unknown>> },
		isLoading: false,
		error: null as Error | null,
	},
	models: {
		data: { models: [] as Array<Record<string, unknown>> },
		isLoading: false,
		error: null as Error | null,
	},
	settings: {
		data: { settings: {} as Record<string, unknown> },
		isLoading: false,
		error: null as Error | null,
	},
	setSetting: { mutateAsync: vi.fn(), error: null as Error | null },
	customMutation: {
		mutate: vi.fn(),
		isPending: false,
		data: null,
		error: null as Error | null,
	},
}));

vi.mock("../../src/renderer/queries", () => ({
	useModelAuthModels: () => mocks.models,
	useModelAuthProviders: () => mocks.providers,
	useSettings: () => mocks.settings,
	useSetSetting: () => mocks.setSetting,
	useFetchCustomProviderModels: () => mocks.customMutation,
	useSaveCustomModel: () => mocks.customMutation,
	useRemoveCustomModel: () => mocks.customMutation,
}));

import { GlobalSettingsDialog } from "../../src/renderer/components/GlobalSettingsDialog";
import { ModelsSettings } from "../../src/renderer/components/ModelsSettings";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.providers.data.providers = [
		...configuredProviders,
		unconfiguredProvider,
		customProvider,
	];
	mocks.models.data.models = [...allModels];
	mocks.settings.data.settings = {};
	mocks.providers.isLoading = false;
	mocks.providers.error = null;
	mocks.models.isLoading = false;
	mocks.models.error = null;
	mocks.settings.isLoading = false;
	mocks.settings.error = null;
	mocks.setSetting.error = null;
	mocks.setSetting.mutateAsync.mockReset();
	mocks.setSetting.mutateAsync.mockResolvedValue(undefined);
	mocks.customMutation.mutate.mockReset();
	await render();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function render() {
	await act(async () => root.render(React.createElement(ModelsSettings)));
}

function button(name: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find(
		(candidate) =>
			candidate.getAttribute("aria-label") === name ||
			candidate.textContent?.includes(name),
	);
	if (!match) throw new Error(`Button not found: ${name}`);
	return match;
}

async function click(element: Element) {
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

async function search(value: string) {
	const input = container.querySelector<HTMLInputElement>(
		'input[type="search"]',
	);
	if (!input) throw new Error("Model search not found");
	const valueSetter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	valueSetter?.call(input, value);
	await act(async () => {
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function settle(action: () => void) {
	await act(async () => {
		action();
		await Promise.resolve();
	});
}

describe("ModelsSettings", () => {
	it("lists configured and custom providers with model counts and switches provider models", async () => {
		expect(container.querySelector("h2")?.classList).toContain(
			"type-view-title",
		);
		expect(container.textContent).toContain("Anthropic");
		expect(container.textContent).toContain("2 models");
		expect(container.textContent).toContain("Google");
		expect(container.textContent).toContain("1 model");
		expect(container.textContent).not.toContain("GPT-5");
		expect(container.textContent).toContain("Claude Sonnet 4");
		expect(container.textContent).not.toContain("Gemini Pro");

		await click(button("Google"));
		expect(container.textContent).toContain("Gemini Pro");
		expect(container.textContent).not.toContain("Claude Sonnet 4");
	});

	it("lists custom providers without fetched models and allows manual or fetched models", async () => {
		expect(container.textContent).toContain("Custom OpenAI");
		expect(container.textContent).toContain("0 models");

		await click(button("Custom OpenAI"));
		expect(
			container.querySelector<HTMLInputElement>(
				'input[aria-label="Custom model ID"]',
			),
		).not.toBeNull();
		expect(button("Fetch models")).toBeTruthy();

		const modelId = container.querySelector<HTMLInputElement>(
			'input[aria-label="Custom model ID"]',
		);
		if (!modelId) throw new Error("Custom model input missing");
		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		valueSetter?.call(modelId, "llama3.1:8b");
		await act(async () => {
			modelId.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await click(button("Add model"));

		expect(mocks.customMutation.mutate).toHaveBeenCalledWith(
			{
				provider: "custom-openai",
				model: { id: "llama3.1:8b", name: "" },
			},
			expect.objectContaining({ onSuccess: expect.any(Function) }),
		);

		await click(button("Fetch models"));
		expect(mocks.customMutation.mutate).toHaveBeenCalledWith({
			provider: "custom-openai",
		});
	});

	it("keeps a selected provider while data changes and falls back when it disappears", async () => {
		await click(button("Google"));
		mocks.models.data.models = [allModels[2], allModels[0]];
		await render();
		expect(container.textContent).toContain("Gemini Pro");
		expect(container.textContent).not.toContain("Claude Sonnet 4");

		mocks.providers.data.providers = [configuredProviders[0]];
		await render();
		expect(container.textContent).toContain("Claude Sonnet 4");
	});

	it("searches the selected provider models case-insensitively by name and ID", async () => {
		await search("OPUS");
		expect(container.textContent).toContain("Claude Opus 4");
		expect(container.textContent).not.toContain("Claude Sonnet 4");

		await search("SONNET-4");
		expect(container.textContent).toContain("Claude Sonnet 4");
		expect(container.textContent).not.toContain("Claude Opus 4");
	});

	it("splits favourites from other models, moves rows, and collapses independently", async () => {
		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "anthropic", modelId: "claude-opus-4" }],
		};
		await render();

		const favourites = button("Favourites (1)");
		const allModels = button("All models (1)");
		expect(favourites.getAttribute("aria-expanded")).toBe("true");
		expect(allModels.getAttribute("aria-expanded")).toBe("true");
		const favouritesContent = document.getElementById(
			favourites.getAttribute("aria-controls") ?? "",
		);
		const allContent = document.getElementById(
			allModels.getAttribute("aria-controls") ?? "",
		);
		expect(favouritesContent?.textContent).toContain("Claude Opus 4");
		expect(favouritesContent?.textContent).not.toContain("Claude Sonnet 4");
		expect(allContent?.textContent).toContain("Claude Sonnet 4");
		expect(allContent?.textContent).not.toContain("Claude Opus 4");

		await click(button("Add Claude Sonnet 4 to favourites"));
		expect(button("Favourites (2)")).toBeTruthy();
		expect(button("All models (0)")).toBeTruthy();

		await click(button("Favourites (2)"));
		expect(button("Favourites (2)").getAttribute("aria-expanded")).toBe(
			"false",
		);
		expect(button("All models (0)").getAttribute("aria-expanded")).toBe("true");
	});

	it("shows pressed favourites and adds one while preserving existing favourites", async () => {
		mocks.settings.data.settings = {
			modelFavourites: [
				{ provider: "anthropic", modelId: "claude-opus-4" },
				{ provider: "legacy", modelId: "kept" },
			],
		};
		await render();

		expect(
			button("Remove Claude Opus 4 from favourites").getAttribute(
				"aria-pressed",
			),
		).toBe("true");
		const add = button("Add Claude Sonnet 4 to favourites");
		expect(add.classList).toContain("type-control");
		expect(add.getAttribute("aria-pressed")).toBe("false");
		await click(add);
		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledWith({
			key: "modelFavourites",
			value: [
				{ provider: "anthropic", modelId: "claude-opus-4" },
				{ provider: "legacy", modelId: "kept" },
				{ provider: "anthropic", modelId: "claude-sonnet-4" },
			],
		});
	});

	it("removes a favourite while preserving all others", async () => {
		mocks.settings.data.settings = {
			modelFavourites: [
				{ provider: "anthropic", modelId: "claude-sonnet-4" },
				{ provider: "google", modelId: "gemini-2.5-pro" },
			],
		};
		await render();
		await click(button("Remove Claude Sonnet 4 from favourites"));
		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledWith({
			key: "modelFavourites",
			value: [{ provider: "google", modelId: "gemini-2.5-pro" }],
		});
	});

	it("serializes two rapid toggles, accumulates their payload, and syncs after draining", async () => {
		const first = deferred();
		const second = deferred();
		mocks.setSetting.mutateAsync
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);

		await click(button("Add Claude Sonnet 4 to favourites"));
		await click(button("Add Claude Opus 4 to favourites"));

		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledTimes(1);
		expect(
			button("Remove Claude Opus 4 from favourites").getAttribute(
				"aria-pressed",
			),
		).toBe("true");

		await settle(() => first.resolve());
		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledTimes(2);
		expect(mocks.setSetting.mutateAsync.mock.calls[1]?.[0]).toEqual({
			key: "modelFavourites",
			value: [
				{ provider: "anthropic", modelId: "claude-sonnet-4" },
				{ provider: "anthropic", modelId: "claude-opus-4" },
			],
		});

		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "anthropic", modelId: "claude-sonnet-4" }],
		};
		await render();
		expect(button("Remove Claude Opus 4 from favourites")).toBeTruthy();

		await settle(() => second.resolve());
		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "google", modelId: "gemini-2.5-pro" }],
		};
		await render();
		expect(button("Add Claude Sonnet 4 to favourites")).toBeTruthy();
		expect(button("Add Claude Opus 4 to favourites")).toBeTruthy();
	});

	it("rolls the latest failed write back to the last persisted favourites", async () => {
		const first = deferred();
		const second = deferred();
		mocks.setSetting.mutateAsync
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);

		await click(button("Add Claude Sonnet 4 to favourites"));
		await click(button("Add Claude Opus 4 to favourites"));
		await settle(() => first.resolve());
		await settle(() => second.reject(new Error("disk is read-only")));

		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not update favourites: disk is read-only",
		);
		expect(button("Remove Claude Sonnet 4 from favourites")).toBeTruthy();
		expect(button("Add Claude Opus 4 to favourites")).toBeTruthy();
	});

	it("recovers a deferred failed write and resumes query sync in StrictMode", async () => {
		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "anthropic", modelId: "claude-sonnet-4" }],
		};
		const write = deferred();
		mocks.setSetting.mutateAsync.mockReturnValueOnce(write.promise);
		await act(async () =>
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(ModelsSettings),
				),
			),
		);

		await click(button("Remove Claude Sonnet 4 from favourites"));
		expect(button("Add Claude Sonnet 4 to favourites")).toBeTruthy();
		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledTimes(1);

		await settle(() => write.reject(new Error("strict failure")));
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not update favourites: strict failure",
		);
		expect(button("Remove Claude Sonnet 4 from favourites")).toBeTruthy();

		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "anthropic", modelId: "claude-opus-4" }],
		};
		await act(async () =>
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(ModelsSettings),
				),
			),
		);
		expect(button("Add Claude Sonnet 4 to favourites")).toBeTruthy();
		expect(button("Remove Claude Opus 4 from favourites")).toBeTruthy();
	});

	it("keeps a later successful desired state when an earlier write fails and preserves the error", async () => {
		const first = deferred();
		const second = deferred();
		mocks.setSetting.mutateAsync
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);

		await click(button("Add Claude Sonnet 4 to favourites"));
		await click(button("Add Claude Opus 4 to favourites"));
		await settle(() => first.reject(new Error("temporary failure")));
		expect(mocks.setSetting.mutateAsync).toHaveBeenCalledTimes(2);
		await settle(() => second.resolve());

		expect(button("Remove Claude Sonnet 4 from favourites")).toBeTruthy();
		expect(button("Remove Claude Opus 4 from favourites")).toBeTruthy();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Could not update favourites: temporary failure",
		);
	});

	it("shows query loading states instead of premature empty states", async () => {
		mocks.providers.data.providers = [];
		mocks.models.data.models = [];
		mocks.providers.isLoading = true;
		mocks.models.isLoading = true;
		mocks.settings.isLoading = true;
		await render();

		expect(container.textContent).toContain("Loading providers");
		expect(container.textContent).toContain("Loading models");
		expect(container.textContent).toContain("Loading favourite settings");
		expect(container.textContent).not.toContain("No configured providers");
	});

	it.each([
		["providers", "Could not load providers: providers failed"],
		["models", "Could not load models: models failed"],
		["settings", "Could not load favourite settings: settings failed"],
	] as const)("renders the %s query error instead of empty states", async (query, message) => {
		mocks.providers.data.providers = [];
		mocks.models.data.models = [];
		mocks[query].error = new Error(`${query} failed`);
		await render();

		expect(container.textContent).toContain(message);
		expect(container.textContent).not.toContain("No configured providers");
	});

	it("shows the no-configured-provider empty state with Providers direction", async () => {
		mocks.providers.data.providers = [unconfiguredProvider];
		await render();
		expect(container.textContent).toContain("No configured providers");
		expect(container.querySelector(".type-status")?.textContent).toContain(
			"No configured providers",
		);
		expect(container.textContent).toContain("Providers");
	});

	it("shows distinct no-model and no-search-match empty states", async () => {
		mocks.models.data.models = allModels.filter(
			(model) => model.provider !== "anthropic",
		);
		await render();
		expect(container.textContent).toContain("Anthropic has no models");

		mocks.models.data.models = [...allModels];
		await render();
		await search("not-a-real-model");
		expect(container.textContent).toContain("No models match");
	});

	it("does not expose model selection behavior", () => {
		expect(container.textContent).not.toContain("Default");
		expect(container.textContent).not.toContain("Current");
		expect(container.textContent).not.toContain("Select model");
		expect(container.querySelector('[role="radio"]')).toBeNull();
	});

	it("places Models between Providers and Defaults in Workspace navigation", async () => {
		await act(async () =>
			root.render(
				React.createElement(GlobalSettingsDialog, {
					open: true,
					onClose: vi.fn(),
				}),
			),
		);
		const labels = [...container.querySelectorAll("aside button")].map((item) =>
			item.textContent?.trim(),
		);
		expect(labels.indexOf("Models")).toBe(labels.indexOf("Providers") + 1);
		expect(labels.indexOf("Defaults")).toBe(labels.indexOf("Models") + 1);
	});
});
