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
		reasoning: true,
		thinkingLevels: ["high"],
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
		thinkingLevels: ["high"],
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
		thinkingLevels: ["high"],
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
	setModel: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../../src/renderer/queries", () => ({
	useModelAuthModels: () => mocks.models,
	useModelAuthProviders: () => mocks.providers,
	useSettings: () => mocks.settings,
	useSetSessionModel: () => mocks.setModel,
}));

import { ChatModelMenu } from "../../src/renderer/components/ChatModelMenu";

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
	mocks.models.data.models = [...models];
	mocks.settings.data.settings = {
		modelFavourites: [
			{ provider: "anthropic", modelId: "claude-sonnet-4" },
			{ provider: "openai", modelId: "gpt-5" },
		],
	};
	mocks.providers.isLoading = false;
	mocks.providers.error = null;
	mocks.models.isLoading = false;
	mocks.models.error = null;
	mocks.settings.isLoading = false;
	mocks.settings.error = null;
	mocks.setModel.mutateAsync.mockReset();
	mocks.setModel.mutateAsync.mockResolvedValue(undefined);
	mocks.setModel.isPending = false;
	await renderMenu();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function renderMenu(streaming = false) {
	await act(async () => {
		root.render(
			React.createElement(ChatModelMenu, {
				piSessionId: "pi-1",
				currentModel: { provider: "anthropic", id: "claude-sonnet-4" },
				modelLabel: "Sonnet 4",
				streaming,
			}),
		);
	});
}

function trigger(): HTMLButtonElement {
	return container.querySelector(
		'button[aria-haspopup="dialog"]',
	) as HTMLButtonElement;
}

async function openMenu() {
	await act(async () => trigger().click());
}

async function searchFor(value: string) {
	const search = container.querySelector(
		'input[type="search"]',
	) as HTMLInputElement;
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	setter?.call(search, value);
	await act(async () => {
		search.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function button(name: string): HTMLButtonElement {
	return [...container.querySelectorAll("button")].find((item) =>
		item.textContent?.includes(name),
	) as HTMLButtonElement;
}

describe("ChatModelMenu", () => {
	it("shows favourites and provider groups, duplicates favourites in All, and excludes unconfigured inventory", async () => {
		await openMenu();
		expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		expect(
			container.querySelector('input[type="search"]')?.classList,
		).toContain("type-control");
		expect(container.querySelector('[role="option"]')?.classList).toContain(
			"type-control",
		);
		expect(container.textContent).toContain("Favourites");
		expect(container.textContent).toContain("All");
		expect(container.textContent).toContain("Anthropic");
		expect(container.textContent).toContain("Google");
		expect(container.textContent?.match(/Claude Sonnet 4/g)).toHaveLength(2);
		expect(container.textContent).not.toContain("GPT-5");
		expect(container.textContent).not.toContain("OpenAI");
		expect(
			container.querySelectorAll('[aria-label*="Current model"]'),
		).toHaveLength(2);
	});

	it("searches provider name, model name, and model id across both sections", async () => {
		await openMenu();
		await searchFor("google");
		expect(container.textContent).toContain("Gemini Pro");
		expect(container.textContent).not.toContain("Claude Opus 4");

		await searchFor("claude-opus");
		expect(container.textContent).toContain("Claude Opus 4");
		expect(container.textContent).not.toContain("Gemini Pro");
	});

	it("selects the exact provider/model, then closes and returns focus", async () => {
		await openMenu();
		await act(async () => button("Gemini Pro").click());
		expect(mocks.setModel.mutateAsync).toHaveBeenCalledWith({
			piSessionId: "pi-1",
			model: { provider: "google", modelId: "gemini-2.5-pro" },
		});
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
	});

	it("keeps the trigger disabled until a deferred switch resolves, then closes and restores focus", async () => {
		let resolveSwitch: (() => void) | undefined;
		mocks.setModel.mutateAsync.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveSwitch = resolve;
				}),
		);
		await openMenu();
		await act(async () => button("Gemini Pro").click());

		expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		expect(trigger().disabled).toBe(true);
		for (const choice of container.querySelectorAll('[role="option"]')) {
			expect((choice as HTMLButtonElement).disabled).toBe(true);
		}

		await act(async () => {
			resolveSwitch?.();
			await Promise.resolve();
		});
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(trigger().disabled).toBe(false);
		await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
	});

	it("keeps a pending switch open when dismissed and preserves retry context after failure", async () => {
		let rejectSwitch: ((error: Error) => void) | undefined;
		mocks.setModel.mutateAsync.mockImplementationOnce(
			() =>
				new Promise<void>((_resolve, reject) => {
					rejectSwitch = reject;
				}),
		);
		await openMenu();
		await act(async () => button("Gemini Pro").click());

		await act(async () => {
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			);
			document.body.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true }),
			);
		});
		expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		expect(trigger().disabled).toBe(true);

		await act(async () => {
			rejectSwitch?.(new Error("switch denied"));
			await Promise.resolve();
		});
		expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		expect(trigger().disabled).toBe(false);
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"switch denied",
		);

		await act(async () => button("Gemini Pro").click());
		expect(mocks.setModel.mutateAsync).toHaveBeenCalledTimes(2);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
	});

	it("closes on Escape and outside pointer, returning focus to the trigger", async () => {
		await openMenu();
		await act(async () =>
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			),
		);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(trigger());

		await openMenu();
		await act(async () =>
			document.body.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true }),
			),
		);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(trigger());
	});

	it("disables the picker while streaming and all choices while pending", async () => {
		await renderMenu(true);
		expect(trigger().disabled).toBe(true);
		await act(async () => trigger().click());
		expect(container.querySelector('[role="dialog"]')).toBeNull();

		await renderMenu(false);
		await openMenu();
		mocks.setModel.isPending = true;
		await renderMenu(false);
		expect(trigger().disabled).toBe(true);
		for (const choice of container.querySelectorAll('[role="option"]')) {
			expect((choice as HTMLButtonElement).disabled).toBe(true);
		}
	});

	it("cleans document listeners when a StrictMode menu unmounts", async () => {
		await act(async () => {
			root.render(
				React.createElement(
					React.StrictMode,
					null,
					React.createElement(ChatModelMenu, {
						piSessionId: "pi-1",
						currentModel: {
							provider: "anthropic",
							id: "claude-sonnet-4",
						},
						modelLabel: "Sonnet 4",
						streaming: false,
					}),
				),
			);
		});
		const add = vi.spyOn(document, "addEventListener");
		const remove = vi.spyOn(document, "removeEventListener");
		await openMenu();
		await act(async () => root.render(null));
		expect(add).toHaveBeenCalledWith("keydown", expect.any(Function));
		expect(add).toHaveBeenCalledWith("pointerdown", expect.any(Function));
		expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
		expect(remove).toHaveBeenCalledWith("pointerdown", expect.any(Function));
		add.mockRestore();
		remove.mockRestore();
	});

	it("renders provider, model, and settings query errors instead of empty states", async () => {
		mocks.providers.error = new Error("provider transport failed");
		mocks.models.error = new Error("model transport failed");
		mocks.settings.error = new Error("settings transport failed");
		await renderMenu();
		await openMenu();

		expect(container.textContent).toContain(
			"Providers could not be loaded: provider transport failed",
		);
		expect(container.textContent).toContain(
			"Models could not be loaded: model transport failed",
		);
		expect(container.textContent).toContain(
			"Settings could not be loaded: settings transport failed",
		);
		expect(container.textContent).not.toContain("No configured providers");
		expect(container.textContent).not.toContain("No favourite models");
	});

	it("renders distinct provider, model, and favourites loading states", async () => {
		mocks.providers.isLoading = true;
		mocks.models.isLoading = true;
		mocks.settings.isLoading = true;
		await renderMenu();
		await openMenu();

		expect(container.textContent).toContain("Loading providers…");
		expect(container.textContent).toContain("Loading models…");
		expect(container.textContent).toContain("Loading favourites…");
		expect(container.textContent).not.toContain("No configured providers");
	});

	it("renders explicit empty favourites, no-provider, and no-results states", async () => {
		mocks.settings.data.settings = { modelFavourites: [] };
		await renderMenu();
		await openMenu();
		expect(container.textContent).toContain("No favourite models");

		await searchFor("nothing matches");
		expect(container.textContent).toContain("No models match your search");

		await act(async () => trigger().click());
		mocks.providers.data.providers = [];
		await renderMenu();
		await openMenu();
		expect(container.textContent).toContain("No configured providers");
		expect(container.textContent).toContain("Open Providers");
	});
});
