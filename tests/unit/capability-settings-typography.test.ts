// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/renderer/components/SkillsList", () => ({
	SkillsList: () => React.createElement("div", null, "skills list"),
}));
vi.mock("../../src/renderer/components/SkillDetail", () => ({
	SkillDetail: () => React.createElement("div", null, "skill detail"),
}));
vi.mock("../../src/renderer/components/ExtensionsList", () => ({
	ExtensionsList: () => null,
}));
vi.mock("../../src/renderer/components/ExtensionDetail", () => ({
	ExtensionDetail: () => null,
}));
vi.mock("../../src/renderer/components/PromptsList", () => ({
	PromptsList: () => null,
}));
vi.mock("../../src/renderer/components/PromptDetail", () => ({
	PromptDetail: () => null,
}));
vi.mock("../../src/renderer/components/dialogs/InstallSkillDialog", () => ({
	InstallSkillDialog: () => null,
}));

import { CapabilitySettings } from "../../src/renderer/components/CapabilitySettings";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(async () => {
	if (root) await act(async () => root?.unmount());
	host?.remove();
	host = undefined;
	root = undefined;
});

describe("CapabilitySettings typography", () => {
	it("keeps the semantic role on its source-level wrapper", () => {
		const source = fs.readFileSync(
			path.join(
				process.cwd(),
				"src/renderer/components/CapabilitySettings.tsx",
			),
			"utf8",
		);
		expect(source).toContain("-m-6 flex h-full min-h-0 type-body");
	});

	it("provides the semantic body role at its rendered content wrapper", async () => {
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		await act(async () =>
			root?.render(React.createElement(CapabilitySettings, { kind: "skills" })),
		);

		expect(host.firstElementChild?.classList).toContain("type-body");
		expect(host.textContent).toContain("skills list");
		expect(host.textContent).toContain("skill detail");
	});
});
