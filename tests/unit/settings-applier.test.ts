// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	settings: {} as Record<string, unknown>,
}));

vi.mock("../../src/renderer/queries", () => ({
	useSettings: () => ({ data: { settings: mocks.settings } }),
}));

import { SettingsApplier } from "../../src/renderer/components/SettingsApplier";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const FAMILY_PROPERTIES = [
	"--font-display",
	"--font-interface",
	"--font-content",
	"--font-mono",
] as const;

const SIZE_PROPERTIES = {
	"--font-size-interface": "14px",
	"--font-size-compact": "13px",
	"--font-size-chat-assistant": "14px",
	"--font-size-chat-user": "14px",
	"--font-size-composer": "14px",
	"--font-size-code-block": "13px",
} as const;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	mocks.settings = {};
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	const documentRoot = document.documentElement;
	delete documentRoot.dataset.typographyPreset;
	delete documentRoot.dataset.themeFamily;
	documentRoot.classList.remove("dark");
	for (const property of [
		...FAMILY_PROPERTIES,
		...Object.keys(SIZE_PROPERTIES),
		"--font-family",
		"--font-family-mono",
		"--font-body",
		"--font-size-sidebar",
	]) {
		documentRoot.style.removeProperty(property);
	}
});

async function render() {
	await act(async () => root.render(React.createElement(SettingsApplier)));
}

describe("SettingsApplier typography projection", () => {
	it("projects the default typography preset and all default region sizes", async () => {
		await render();

		const documentRoot = document.documentElement;
		expect(documentRoot.dataset.typographyPreset).toBe("default");
		for (const familyProperty of FAMILY_PROPERTIES) {
			expect(documentRoot.style.getPropertyValue(familyProperty)).toBe("");
		}
		for (const [property, value] of Object.entries(SIZE_PROPERTIES)) {
			expect(documentRoot.style.getPropertyValue(property)).toBe(value);
		}
		expect(documentRoot.style.getPropertyValue("--font-family")).toBe("");
		expect(documentRoot.style.getPropertyValue("--font-family-mono")).toBe("");
		expect(documentRoot.style.getPropertyValue("--font-body")).toBe("");
		expect(documentRoot.style.getPropertyValue("--font-size-sidebar")).toBe("");
	});

	it("projects and removes explicit family overrides", async () => {
		mocks.settings = {
			typographyPreset: "theme",
			fontFamilyDisplay: '"Fraunces", serif',
			fontFamily: "Inter, sans-serif",
			fontFamilyContent: '"Source Serif 4", serif',
			fontFamilyMono: '"JetBrains Mono", monospace',
		};
		await render();

		const documentRoot = document.documentElement;
		expect(documentRoot.dataset.typographyPreset).toBe("theme");
		expect(documentRoot.style.getPropertyValue("--font-display")).toBe(
			'"Fraunces", serif',
		);
		expect(documentRoot.style.getPropertyValue("--font-interface")).toBe(
			"Inter, sans-serif",
		);
		expect(documentRoot.style.getPropertyValue("--font-content")).toBe(
			'"Source Serif 4", serif',
		);
		expect(documentRoot.style.getPropertyValue("--font-mono")).toBe(
			'"JetBrains Mono", monospace',
		);

		mocks.settings = {};
		await render();

		for (const familyProperty of FAMILY_PROPERTIES) {
			expect(documentRoot.style.getPropertyValue(familyProperty)).toBe("");
		}
	});
});
