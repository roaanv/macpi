// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	setThinking: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../../src/renderer/queries", () => ({
	useSetSessionThinkingLevel: () => mocks.setThinking,
}));

import { ChatThinkingMenu } from "../../src/renderer/components/ChatThinkingMenu";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.setThinking.mutateAsync.mockReset();
	mocks.setThinking.mutateAsync.mockResolvedValue(undefined);
	mocks.setThinking.isPending = false;
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function renderMenu(streaming = false) {
	await act(async () => {
		root.render(
			React.createElement(ChatThinkingMenu, {
				piSessionId: "pi-1",
				currentLevel: "low",
				availableLevels: ["off", "low", "high"],
				streaming,
			}),
		);
	});
}

function trigger() {
	const result = container.querySelector<HTMLButtonElement>(
		"button[aria-haspopup]",
	);
	if (!result) throw new Error("missing trigger");
	return result;
}

async function openMenu() {
	await renderMenu();
	await act(async () => trigger().click());
}

describe("ChatThinkingMenu", () => {
	it("shows only supported levels and marks the current one", async () => {
		await openMenu();
		expect(trigger().classList).toContain("type-control");
		const options = [...container.querySelectorAll('[role="option"]')];
		expect(options[0]?.classList).toContain("type-control");
		expect(container.querySelector(".type-overline")?.textContent).toContain(
			"Thinking level",
		);
		expect(options.map((option) => option.textContent?.trim())).toEqual([
			"Off",
			"LowCurrent",
			"High",
		]);
		expect(
			container.querySelector('[aria-selected="true"]')?.textContent,
		).toContain("Low");
	});

	it("sets the current and default thinking level, closes, and restores focus", async () => {
		await openMenu();
		const high = [
			...container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
		].find((item) => item.textContent?.includes("High"));
		if (!high) throw new Error("missing high");
		await act(async () => high.click());
		expect(mocks.setThinking.mutateAsync).toHaveBeenCalledWith({
			piSessionId: "pi-1",
			level: "high",
		});
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
	});

	it("keeps failure context open for retry", async () => {
		mocks.setThinking.mutateAsync.mockRejectedValueOnce(
			new Error("thinking denied"),
		);
		await openMenu();
		const high = [
			...container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
		].find((item) => item.textContent?.includes("High"));
		if (!high) throw new Error("missing high");
		await act(async () => high.click());
		expect(container.querySelector('[role="dialog"]')).not.toBeNull();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"thinking denied",
		);
	});

	it("closes on Escape and outside pointer when idle", async () => {
		await openMenu();
		await act(async () =>
			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			),
		);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		await act(async () => trigger().click());
		await act(async () =>
			document.body.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true }),
			),
		);
		expect(container.querySelector('[role="dialog"]')).toBeNull();
	});

	it("disables the trigger while streaming or pending", async () => {
		await renderMenu(true);
		expect(trigger().disabled).toBe(true);
		await renderMenu(false);
		mocks.setThinking.isPending = true;
		await renderMenu(false);
		expect(trigger().disabled).toBe(true);
	});
});
