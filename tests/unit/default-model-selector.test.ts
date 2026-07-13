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
		mutateAsync: vi.fn(),
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
	mocks.setSelected.mutateAsync.mockReset();
	mocks.setSelected.mutateAsync.mockResolvedValue(undefined);
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

async function openMenu() {
	const trigger = container.querySelector<HTMLButtonElement>(
		'button[aria-haspopup="dialog"]',
	);
	if (!trigger) throw new Error("Default model menu trigger not found");
	await act(async () => trigger.click());
	return trigger;
}

function menuOption(text: string) {
	const option = [
		...container.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
	].find((button) => button.textContent?.includes(text));
	if (!option) throw new Error(`Default model option not found: ${text}`);
	return option;
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
	it("groups only configured models by configured provider", async () => {
		await openMenu();
		const text = container.textContent ?? "";
		expect(text).toContain("Anthropic");
		expect(text).toContain("Google");
		expect(text).toContain("Automatic fallback");
		expect(text).toContain("Claude Sonnet 4");
		expect(text).toContain("Claude Opus 4");
		expect(text).toContain("Gemini Pro");
		expect(text).not.toContain("GPT-5");
		expect(container.querySelector('input[type="search"]')).not.toBeNull();
	});

	it("opens a searchable grouped popup and saves a model", async () => {
		mocks.settings.data.settings = {
			modelFavourites: [{ provider: "anthropic", modelId: "claude-opus-4" }],
		};
		await renderSelector();
		const trigger = container.querySelector<HTMLButtonElement>(
			'button[aria-haspopup="dialog"]',
		);
		if (!trigger) throw new Error("Default model menu trigger not found");
		await act(async () => trigger.click());
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(trigger.getAttribute("aria-controls")).toBe(
			"default-model-menu-dialog",
		);
		expect(container.textContent).toContain("Favourites");
		expect(container.textContent?.match(/Claude Opus 4/g)?.length).toBe(2);
		const search = container.querySelector<HTMLInputElement>(
			"#default-model-menu-search",
		);
		if (!search) throw new Error("Default model search not found");
		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			setter?.call(search, "gemini");
			search.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(container.textContent).toContain("Gemini Pro");
		expect(container.textContent).not.toContain("Claude Sonnet 4");
		const gemini = [
			...container.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
		].find((button) => button.textContent?.includes("Gemini Pro"));
		if (!gemini) throw new Error("Gemini option not found");
		await act(async () => gemini.click());
		expect(mocks.setSelected.mutateAsync).toHaveBeenCalledWith({
			model: { provider: "google", modelId: "gemini-2.5-pro" },
		});
	});

	it("sets a model and clears to Automatic with the expected payloads", async () => {
		await openMenu();
		await act(async () => menuOption("Claude Opus 4").click());
		expect(mocks.setSelected.mutateAsync).toHaveBeenLastCalledWith({
			model: { provider: "anthropic", modelId: "claude-opus-4" },
		});
		await openMenu();
		await act(async () => menuOption("Automatic fallback").click());
		expect(mocks.setSelected.mutateAsync).toHaveBeenLastCalledWith({
			model: null,
		});
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
		expect(
			container.querySelector('button[aria-haspopup="dialog"]')?.textContent,
		).toContain("Claude Sonnet 4");
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
		await openMenu();
		expect(container.textContent).toContain("Automatic fallback");
		expect(container.textContent).toContain("Claude Sonnet 4");
		expect(mocks.setSelected.mutateAsync).not.toHaveBeenCalled();
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
		await openMenu();
		mocks.setSelected.isPending = true;
		await renderSelector();
		expect(container.textContent).toContain("Saving default model");
		await act(async () => menuOption("Claude Opus 4").click());
		expect(mocks.setSelected.mutateAsync).not.toHaveBeenCalled();

		mocks.setSelected.isPending = false;
		mocks.setSelected.mutateAsync.mockRejectedValueOnce(
			new Error("save failed"),
		);
		await renderSelector();
		await act(async () => menuOption("Claude Opus 4").click());
		expect(container.textContent).toContain("save failed");
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
