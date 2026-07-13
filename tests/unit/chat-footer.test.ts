// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	footer: {
		data: {
			model: {
				provider: "anthropic",
				id: "claude-sonnet-4",
				name: "Claude Sonnet 4",
				contextWindow: 200000,
			},
			thinkingLevel: "high",
			availableThinkingLevels: ["off", "low", "high"],
			contextUsage: { tokens: 100000, contextWindow: 200000, percent: 50 },
		},
	},
	providers: { data: { providers: [] }, isLoading: false, error: null },
	models: { data: { models: [] }, isLoading: false, error: null },
	settings: { data: { settings: {} }, isLoading: false, error: null },
	setModel: { mutateAsync: vi.fn(), isPending: false },
	setThinking: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../../src/renderer/queries", () => ({
	useInvalidateOnTurnEnd: vi.fn(),
	useSessionFooterStats: () => mocks.footer,
	useModelAuthModels: () => mocks.models,
	useModelAuthProviders: () => mocks.providers,
	useSettings: () => mocks.settings,
	useSetSessionModel: () => mocks.setModel,
	useSetSessionThinkingLevel: () => mocks.setThinking,
}));

import { ChatFooter } from "../../src/renderer/components/ChatFooter";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function renderFooter(
	piSessionId: string | null = "pi-1",
	streaming = false,
) {
	await act(async () =>
		root.render(React.createElement(ChatFooter, { piSessionId, streaming })),
	);
}

describe("ChatFooter", () => {
	it("keeps the footer stats while making the model an interactive compact button", async () => {
		await renderFooter();
		const picker = container.querySelector(
			'button[aria-haspopup="dialog"]',
		) as HTMLButtonElement;
		expect(picker).not.toBeNull();
		expect(picker.textContent).toContain("Sonnet 4");
		expect(picker.getAttribute("aria-expanded")).toBe("false");
		expect(container.textContent).toContain("think:");
		expect(container.textContent).toContain("high");
		expect(container.textContent).toContain("50% (100k/200k)");
	});

	it("retains existing no-session behavior and passes streaming disablement", async () => {
		await renderFooter(null);
		expect(container.textContent).toBe("");
		await renderFooter("pi-1", true);
		const pickers = container.querySelectorAll<HTMLButtonElement>(
			'button[aria-haspopup="dialog"]',
		);
		expect(pickers).toHaveLength(2);
		for (const picker of pickers) expect(picker.disabled).toBe(true);
	});
});
