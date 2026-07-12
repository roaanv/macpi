// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providers = [
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
	{
		id: "openai",
		name: "OpenAI",
		authType: "api_key",
		authStatus: { configured: false },
		modelCount: 1,
		availableModelCount: 0,
		supportsOAuth: false,
		supportsStoredApiKey: true,
	},
];

const models = [
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
	selected: {
		data: {
			model: null as null | { provider: string; modelId: string },
			valid: true,
		},
		isLoading: false,
		error: null as Error | null,
	},
	setSelected: {
		mutate: vi.fn(),
		isPending: false,
		error: null as Error | null,
	},
	settings: { data: { settings: {} } },
	setSetting: { mutate: vi.fn() },
	openFolder: { mutateAsync: vi.fn() },
	defaultCwd: { data: { cwd: "/Users/test" } },
}));

vi.mock("../../src/renderer/queries", () => ({
	useDefaultCwd: () => mocks.defaultCwd,
	useModelAuthModels: () => mocks.models,
	useModelAuthProviders: () => mocks.providers,
	useOpenFolder: () => mocks.openFolder,
	useSelectedModel: () => mocks.selected,
	useSetSelectedModel: () => mocks.setSelected,
	useSetSetting: () => mocks.setSetting,
	useSettings: () => mocks.settings,
}));

vi.mock("../../src/renderer/ipc", () => ({ invoke: vi.fn() }));

import {
	AUTOMATIC_DEFAULT_MODEL_VALUE,
	DefaultModelSelector,
	decodeDefaultModelValue,
	encodeDefaultModelValue,
} from "../../src/renderer/components/DefaultModelSelector";
import { DefaultsSettings } from "../../src/renderer/components/DefaultsSettings";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.providers.data.providers = [...providers];
	mocks.providers.isLoading = false;
	mocks.providers.error = null;
	mocks.models.data.models = [...models];
	mocks.models.isLoading = false;
	mocks.models.error = null;
	mocks.selected.data = { model: null, valid: true };
	mocks.selected.isLoading = false;
	mocks.selected.error = null;
	mocks.setSelected.mutate.mockReset();
	mocks.setSelected.isPending = false;
	mocks.setSelected.error = null;
	await renderSelector();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function renderSelector() {
	await act(async () => root.render(React.createElement(DefaultModelSelector)));
}

function selector(): HTMLSelectElement {
	const element = container.querySelector<HTMLSelectElement>(
		"select#default-model",
	);
	if (!element) throw new Error("Default model selector not found");
	return element;
}

async function changeSelect(value: string) {
	const element = selector();
	element.value = value;
	await act(async () => {
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

async function search(value: string) {
	const input = container.querySelector<HTMLInputElement>(
		'input[type="search"]',
	);
	if (!input) throw new Error("Search input not found");
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	setter?.call(input, value);
	await act(async () => {
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function optionTexts() {
	return [...selector().options].map((option) => option.text);
}

describe("DefaultModelSelector codec", () => {
	it("round trips NUL and delimiter characters and rejects malformed values", () => {
		const model = { provider: "local\0/provider", modelId: "model:%/[x]" };
		const encoded = encodeDefaultModelValue(model);
		expect(encoded).not.toContain("\0");
		expect(decodeDefaultModelValue(encoded)).toEqual(model);
		expect(decodeDefaultModelValue("model:%not-json")).toBeNull();
		expect(decodeDefaultModelValue("model:%5B1%2C2%5D")).toBeNull();
		expect(decodeDefaultModelValue("")).toBeNull();
	});
});

describe("DefaultModelSelector", () => {
	it("groups only configured models by configured provider", () => {
		expect(
			[...selector().querySelectorAll("optgroup")].map((group) => group.label),
		).toEqual(["Anthropic", "Google"]);
		expect(optionTexts()).toEqual([
			"Automatic fallback",
			"Claude Sonnet 4",
			"Claude Opus 4",
			"Gemini Pro",
		]);
		expect(container.textContent).not.toContain("GPT-5");
		expect(container.querySelector("h3")?.textContent).toBe(
			"Default model for new chats",
		);
	});

	it("searches across provider, model name, and model ID", async () => {
		await search("google");
		expect(optionTexts()).toEqual(["Automatic fallback", "Gemini Pro"]);

		await search("OPUS-4");
		expect(optionTexts()).toEqual(["Automatic fallback", "Claude Opus 4"]);
	});

	it("keeps the current valid model selected while hiding other search nonmatches", async () => {
		const savedModel = {
			provider: "anthropic",
			modelId: "claude-sonnet-4",
		};
		const savedValue = encodeDefaultModelValue(savedModel);
		await changeSelect(savedValue);
		expect(mocks.setSelected.mutate).toHaveBeenLastCalledWith({
			model: savedModel,
		});

		mocks.selected.data = { model: savedModel, valid: true };
		await renderSelector();
		await search("gemini");

		expect(selector().value).toBe(savedValue);
		expect(selector().selectedIndex).toBeGreaterThan(0);
		expect(selector().options[selector().selectedIndex]?.text).toBe(
			"Claude Sonnet 4",
		);
		expect(optionTexts()).toEqual([
			"Automatic fallback",
			"Claude Sonnet 4",
			"Gemini Pro",
		]);
		expect(
			[...selector().options].filter((option) => option.value === savedValue),
		).toHaveLength(1);
		expect(optionTexts()).not.toContain("Claude Opus 4");
	});

	it("sets a model and clears to Automatic with the expected payloads", async () => {
		await changeSelect(
			encodeDefaultModelValue({
				provider: "anthropic",
				modelId: "claude-opus-4",
			}),
		);
		expect(mocks.setSelected.mutate).toHaveBeenLastCalledWith({
			model: { provider: "anthropic", modelId: "claude-opus-4" },
		});

		await changeSelect(AUTOMATIC_DEFAULT_MODEL_VALUE);
		expect(mocks.setSelected.mutate).toHaveBeenLastCalledWith({ model: null });
		expect(container.textContent).toContain(
			"Existing chats keep their current model",
		);
	});

	it("clearly shows the current saved default", async () => {
		mocks.selected.data = {
			model: { provider: "anthropic", modelId: "claude-sonnet-4" },
			valid: true,
		};
		await renderSelector();
		expect(selector().value).toBe(
			encodeDefaultModelValue({
				provider: "anthropic",
				modelId: "claude-sonnet-4",
			}),
		);
		expect(container.textContent).toContain(
			"Current saved default: Claude Sonnet 4",
		);
	});

	it("preserves and warns about an unavailable saved default while offering recovery", async () => {
		mocks.selected.data = {
			model: { provider: "legacy", modelId: "removed-model" },
			valid: false,
			error: "Selected model legacy/removed-model is unavailable",
		} as typeof mocks.selected.data;
		await renderSelector();
		expect(container.textContent).toContain(
			"Current saved default: legacy / removed-model",
		);
		expect(container.textContent).toContain(
			"Selected model legacy/removed-model is unavailable",
		);
		expect(selector().value).toBe(
			encodeDefaultModelValue({ provider: "legacy", modelId: "removed-model" }),
		);
		expect(optionTexts()).toContain("Unavailable: legacy / removed-model");
		expect(optionTexts()).toContain("Automatic fallback");
		expect(optionTexts()).toContain("Claude Sonnet 4");
		expect(mocks.setSelected.mutate).not.toHaveBeenCalled();
	});

	it("distinguishes loading, query errors, and no configured models", async () => {
		mocks.providers.isLoading = true;
		await renderSelector();
		expect(container.textContent).toContain("Loading providers");

		mocks.providers.isLoading = false;
		mocks.providers.error = new Error("providers failed");
		mocks.models.error = new Error("models failed");
		mocks.selected.error = new Error("selected failed");
		await renderSelector();
		expect(container.textContent).toContain(
			"Providers could not be loaded: providers failed",
		);
		expect(container.textContent).toContain(
			"Models could not be loaded: models failed",
		);
		expect(container.textContent).toContain(
			"Saved default could not be loaded: selected failed",
		);

		mocks.providers.error = null;
		mocks.models.error = null;
		mocks.selected.error = null;
		mocks.providers.data.providers = [providers[2]];
		mocks.models.data.models = [models[3]];
		await renderSelector();
		expect(container.textContent).toContain("No configured models available");
	});

	it("shows save pending and errors and prevents duplicate changes while pending", async () => {
		mocks.setSelected.isPending = true;
		await renderSelector();
		expect(selector().disabled).toBe(true);
		expect(container.textContent).toContain("Saving default model");
		await changeSelect(
			encodeDefaultModelValue({
				provider: "anthropic",
				modelId: "claude-opus-4",
			}),
		);
		expect(mocks.setSelected.mutate).not.toHaveBeenCalled();

		mocks.setSelected.isPending = false;
		mocks.setSelected.error = new Error("save failed");
		await renderSelector();
		expect(container.textContent).toContain(
			"Default model could not be saved: save failed",
		);
	});

	it("does not clear the saved default for a malformed select value", async () => {
		await changeSelect("model:%not-json");
		expect(mocks.setSelected.mutate).not.toHaveBeenCalled();
	});
});

describe("DefaultsSettings", () => {
	it("composes the default model selector below default cwd", async () => {
		await act(async () => root.render(React.createElement(DefaultsSettings)));
		const text = container.textContent ?? "";
		expect(text.indexOf("Default cwd")).toBeGreaterThanOrEqual(0);
		expect(text.indexOf("Default model for new chats")).toBeGreaterThan(
			text.indexOf("Default cwd"),
		);
	});
});
