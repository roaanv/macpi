// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	providers: {
		data: {
			providers: [
				{
					id: "anthropic",
					name: "Anthropic",
					authType: "api_key",
					authStatus: { configured: true },
					modelCount: 1,
					availableModelCount: 1,
					supportsOAuth: false,
					supportsStoredApiKey: true,
				},
				{
					id: "local-ollama",
					name: "Ollama",
					authType: "api_key",
					authStatus: { configured: false },
					modelCount: 0,
					availableModelCount: 0,
					supportsOAuth: false,
					supportsStoredApiKey: true,
				},
			],
		},
		error: null as Error | null,
		isLoading: false,
	},
	models: {
		data: {
			models: [
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
			],
			registryError: undefined,
		},
	},
	mutation: { mutate: vi.fn(), error: null, isPending: false },
}));

vi.mock("../../src/renderer/queries", () => ({
	useListLocalOpenAIModels: () => mocks.mutation,
	useLogoutProvider: () => mocks.mutation,
	useModelAuthModels: () => mocks.models,
	useModelAuthProviders: () => mocks.providers,
	useSaveApiKey: () => mocks.mutation,
	useSaveLocalOpenAIProvider: () => mocks.mutation,
}));

vi.mock("../../src/renderer/components/ModelsJsonEditor", () => ({
	ModelsJsonEditor: () =>
		React.createElement("div", null, "models.json editor"),
}));
vi.mock("../../src/renderer/components/ImportPiAuthModels", () => ({
	ImportPiAuthModels: () =>
		React.createElement("div", null, "pi import controls"),
}));
vi.mock("../../src/renderer/components/OAuthLoginDialog", () => ({
	OAuthLoginDialog: () => null,
}));

import { ErrorBanner } from "../../src/renderer/components/banners/ErrorBanner";
import { ProvidersSettings } from "../../src/renderer/components/ProvidersSettings";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.mutation.mutate.mockReset();
	await act(async () => root.render(React.createElement(ProvidersSettings)));
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

function button(name: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find((candidate) =>
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

describe("ProvidersSettings", () => {
	it("focuses the screen on provider management and retains provider actions", async () => {
		expect(container.textContent).toContain("Providers");
		expect(container.textContent).not.toContain("Models & Auth");
		expect(container.textContent).not.toContain("Active:");
		expect(container.textContent?.toLowerCase()).not.toContain("favourite");
		expect(button("Advanced")).toBeTruthy();
		expect(button("Import from pi")).toBeTruthy();
		expect(button("Add local OpenAI-compatible provider")).toBeTruthy();
		expect(button("Add / replace API key")).toBeTruthy();
		expect(button("Remove auth")).toBeTruthy();

		await click(button("Advanced"));
		expect(container.textContent).toContain("Advanced models.json");
		expect(container.textContent).toContain("models.json editor");
		await click(button("Close"));

		await click(button("Import from pi"));
		expect(container.textContent).toContain("pi import controls");
		await click(button("Close"));

		await click(button("Add local OpenAI-compatible provider"));
		expect(container.textContent).toContain(
			"Connect Ollama, LM Studio, vLLM, or a local proxy",
		);
		expect(button("Fetch models")).toBeTruthy();
	});

	it("saves a discovered local provider without selecting a model", async () => {
		await click(button("Add local OpenAI-compatible provider"));
		await click(button("Fetch models"));

		const discoveryOptions = mocks.mutation.mutate.mock.calls[0]?.[1] as {
			onSuccess: (data: {
				models: Array<{ id: string; name: string }>;
			}) => void;
		};
		await act(async () => {
			discoveryOptions.onSuccess({
				models: [{ id: "llama3", name: "Llama 3" }],
			});
		});
		await click(button("Save provider"));

		const savePayload = mocks.mutation.mutate.mock.calls[1]?.[0];
		expect(savePayload).toEqual({
			providerId: "local-openai",
			name: "Local OpenAI",
			baseUrl: "http://localhost:11434/v1",
			apiKey: "ollama",
			models: [{ id: "llama3", name: "Llama 3" }],
		});
		expect(savePayload).not.toHaveProperty("selectedModelId");
	});

	it("offers an accessible compact provider filter and applies it", async () => {
		const select = container.querySelector<HTMLSelectElement>(
			"select#provider-filter",
		);
		expect(select?.labels?.[0]?.textContent).toBe("Filter providers");
		expect(
			[...(select?.options ?? [])].map((option) => [option.value, option.text]),
		).toEqual([
			["all", "All"],
			["configured", "Configured"],
			["cloud", "Cloud"],
			["local", "Local"],
		]);

		if (!select) throw new Error("Provider filter not found");
		select.value = "local";
		await act(async () => {
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(container.textContent).toContain("Ollama");
		expect(container.textContent).not.toContain("Anthropic");
	});

	it("keeps model inventory collapsed and expands to read-only name and id rows", async () => {
		const details = container.querySelector("details");
		expect(details?.open).toBe(false);
		expect(details?.querySelector("summary")?.textContent?.trim()).toBe(
			"1 models available",
		);

		const summary = details?.querySelector("summary");
		if (!summary || !details) throw new Error("Model inventory not found");
		await click(summary);
		expect(details.open).toBe(true);
		expect(details.textContent).toContain("Claude Sonnet 4");
		expect(details.textContent).toContain("claude-sonnet-4");
		expect(details.querySelectorAll("button")).toHaveLength(0);
	});

	it("links auth and model errors to Providers", async () => {
		await act(async () => {
			root.render(
				React.createElement(ErrorBanner, {
					state: { code: "auth", message: "Authentication required" },
					onOpenSettings: vi.fn(),
				}),
			);
		});
		expect(button("Open Providers")).toBeTruthy();
		expect(container.textContent).not.toContain("Open Models & Auth");
	});
});
