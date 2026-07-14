// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	settings: {
		data: { settings: {} as Record<string, unknown> },
	},
	setSetting: { mutate: vi.fn() },
}));

vi.mock("../../src/renderer/queries", () => ({
	useSettings: () => mocks.settings,
	useSetSetting: () => mocks.setSetting,
}));

import { FontSettings } from "../../src/renderer/components/FontSettings";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.settings.data.settings = {};
	mocks.setSetting.mutate.mockReset();
	await act(async () => root.render(React.createElement(FontSettings)));
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

async function change(
	element: HTMLInputElement | HTMLSelectElement,
	value: string,
) {
	const prototype =
		element instanceof HTMLSelectElement
			? HTMLSelectElement.prototype
			: HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
	setter?.call(element, value);
	await act(async () => {
		element.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

function control<T extends HTMLInputElement | HTMLSelectElement>(
	label: string,
	selector: string,
): T {
	const labels = [...container.querySelectorAll("label")];
	const match = labels.find((candidate) =>
		candidate.textContent?.includes(label),
	);
	const nested = match?.querySelector<T>(selector);
	const associated = match?.htmlFor
		? container.querySelector<T>(`#${match.htmlFor}`)
		: null;
	const element = nested ?? associated;
	if (!element?.matches(selector)) {
		throw new Error(`${label} control not found`);
	}
	return element;
}

describe("FontSettings", () => {
	it("renders semantic typography choices and all family and size regions", () => {
		for (const text of [
			"Typography preset",
			"Display font family",
			"Interface font family",
			"Content font family",
			"Monospace font family",
			"Interface scale",
			"Compact / navigation",
			"Assistant content",
			"User content",
			"Composer",
			"Code / data",
			"Theme default",
		]) {
			expect(container.textContent).toContain(text);
		}
		expect(container.textContent).not.toContain("Default (Inter)");
		expect(container.querySelector(".type-section-heading")).not.toBeNull();
		expect(container.querySelector(".type-label")).not.toBeNull();
		expect(container.querySelector(".type-control")).not.toBeNull();
		expect(
			container.querySelector(".type-metadata.type-tabular"),
		).not.toBeNull();
	});

	it("persists the preset and exact family and size setting keys", async () => {
		await change(control("Typography preset", "select"), "theme");
		expect(mocks.setSetting.mutate).toHaveBeenCalledWith({
			key: "typographyPreset",
			value: "theme",
		});

		const displayFamily = control<HTMLSelectElement>(
			"Display font family",
			"select",
		);
		const bricolage =
			'"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif';
		await change(displayFamily, bricolage);
		expect(mocks.setSetting.mutate).toHaveBeenCalledWith({
			key: "fontFamilyDisplay",
			value: bricolage,
		});

		const interfaceScale = control<HTMLInputElement>(
			"Interface scale",
			'input[type="range"]',
		);
		expect(interfaceScale.min).toBe("11");
		expect(interfaceScale.max).toBe("32");
		await change(interfaceScale, "16");
		expect(mocks.setSetting.mutate).toHaveBeenCalledWith({
			key: "fontSize.interface",
			value: 16,
		});
	});
});
