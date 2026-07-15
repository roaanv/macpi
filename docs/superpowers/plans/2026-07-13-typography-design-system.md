# MacPi Typography Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MacPi’s scattered typography declarations with the four-family, nine-role design system defined in `docs/font-usage.md`, while preserving useful user sizing preferences and optional theme-specific font personality.

**Architecture:** Establish one settings model for typography preset, four family overrides, and six size scales. `SettingsApplier` projects those settings onto canonical CSS custom properties; `styles.css` owns all family resolution, semantic role metrics, and text-behavior utilities. Renderer components consume semantic `.type-*` classes instead of choosing independent families, arbitrary micro-sizes, and line heights.

**Tech Stack:** Electron 42, React 18, TypeScript 5.7, Tailwind CSS 3, CodeMirror 6, Vitest, jsdom, Biome.

**Design authority:** `docs/font-usage.md`

---

## Mandatory repository gates

These gates apply to every task below.

1. Before editing any named function, class, or component, run GitNexus `impact({ target: "<symbol>", direction: "upstream" })`.
2. Report the direct callers, affected execution flows, and risk level before editing. If GitNexus reports **HIGH** or **CRITICAL**, stop and warn the user before proceeding.
3. Before each commit, run GitNexus `detect_changes({ scope: "compare", base_ref: "main" })` and verify that only the task’s expected symbols and flows changed.
4. Use `bfs` for filename searches and `rg` for text searches.
5. Use TDD: failing focused test, minimal implementation, focused pass, broader pass, then commit.
6. Run `git diff --check` before every commit; do not commit whitespace errors.

## File and responsibility map

### Core settings and token projection

- Modify `src/shared/app-settings-keys.ts` — typography preset, family categories, six scale regions, legacy-key fallback, and clamping.
- Modify `src/renderer/components/SettingsApplier.tsx` — write typography preset and canonical family/size custom properties to `<html>`.
- Modify `src/renderer/components/FontSettings.tsx` — expose preset, four family categories, and six scale controls.
- Modify `src/renderer/styles.css` — default and optional theme pairings, semantic role classes, behavior utilities, and Markdown role styling.

### Tests

- Modify `tests/unit/app-settings-keys.test.ts` — settings defaults, validation, legacy fallback, and clamping.
- Create `tests/unit/settings-applier.test.ts` — DOM projection of preset, family overrides, and sizes.
- Create `tests/unit/font-settings.test.ts` — settings UI labels and mutation keys.
- Create `tests/unit/typography-css.test.ts` — canonical token and role contract.
- Create `tests/unit/typography-source-contract.test.ts` — prevent reintroduction of old font variables and sub-11px text.

### Surface migrations

- Modify shell/navigation/resource-list components — semantic hierarchy, row labels, metadata, overlines, and truncation.
- Modify chat/message/banner components — content roles, configurable message sizes, status roles, and microcopy cleanup.
- Modify code/file/editor components — one effective mono family, one code scale, explicit CodeMirror metrics, and technical wrapping.
- Modify settings/dialog/menu components — consistent View title, Section heading, Label, Control, Metadata, Overline, and Status roles.

### Cleanup and documentation

- Modify `package.json` and `package-lock.json` — remove four verified-unused font dependencies.
- Modify `docs/font-usage.md` — mark the original inventory as the pre-migration baseline and record the implemented token contract.

---

## Task 1: Expand and validate the typography settings model

**Files:**
- Modify: `src/shared/app-settings-keys.ts:1-153`
- Modify: `tests/unit/app-settings-keys.test.ts:1-90`

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact for `APP_SETTINGS_DEFAULTS`, `getFontFamily`, and `getFontSize`. Confirm the blast radius is limited to renderer settings, settings IPC typing, and their tests before editing.

- [ ] **Step 2: Write failing settings tests**

Replace the current font-specific imports and tests with coverage for the complete contract:

```ts
import {
	APP_SETTINGS_DEFAULTS,
	getFontFamily,
	getFontSize,
	getTypographyPreset,
} from "../../src/shared/app-settings-keys";

describe("typography settings", () => {
	it("defaults to the consistent typography preset", () => {
		expect(getTypographyPreset({})).toBe("default");
		expect(getTypographyPreset({ typographyPreset: "theme" })).toBe("theme");
		expect(getTypographyPreset({ typographyPreset: "unknown" })).toBe("default");
	});

	it("supports four independent family categories", () => {
		expect(getFontFamily({}, "display")).toBe("");
		expect(getFontFamily({}, "interface")).toBe("");
		expect(getFontFamily({}, "content")).toBe("");
		expect(getFontFamily({}, "mono")).toBe("");
		expect(
			getFontFamily(
				{
					fontFamilyDisplay: "Display Face",
					fontFamily: "Interface Face",
					fontFamilyContent: "Content Face",
					fontFamilyMono: "Mono Face",
				},
				"content",
			),
		).toBe("Content Face");
	});

	it("defines six scales and migrates the legacy sidebar size", () => {
		expect(getFontSize({}, "interface")).toBe(14);
		expect(getFontSize({}, "compact")).toBe(13);
		expect(getFontSize({}, "chatAssistant")).toBe(14);
		expect(getFontSize({}, "chatUser")).toBe(14);
		expect(getFontSize({}, "composer")).toBe(14);
		expect(getFontSize({}, "codeBlock")).toBe(13);
		expect(getFontSize({ "fontSize.sidebar": 16 }, "compact")).toBe(16);
		expect(
			getFontSize(
				{ "fontSize.sidebar": 16, "fontSize.compact": 15 },
				"compact",
			),
		).toBe(15);
	});

	it("clamps persisted sizes to the supported 11–32px range", () => {
		expect(getFontSize({ "fontSize.interface": 8 }, "interface")).toBe(11);
		expect(getFontSize({ "fontSize.codeBlock": 40 }, "codeBlock")).toBe(32);
		expect(getFontSize({ "fontSize.compact": "huge" }, "compact")).toBe(13);
	});

	it("keeps legacy keys recognized during migration", () => {
		expect(APP_SETTINGS_DEFAULTS).toHaveProperty("fontSize.sidebar", 13);
	});
});
```

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
npm test -- tests/unit/app-settings-keys.test.ts
```

Expected: FAIL because `getTypographyPreset`, categorized `getFontFamily`, and the new size regions do not exist.

- [ ] **Step 4: Implement the typed settings contract**

Add these types, defaults, mappings, and accessors:

```ts
export type TypographyPreset = "default" | "theme";
export type FontFamilyRegion = "display" | "interface" | "content" | "mono";
export type FontSizeRegion =
	| "interface"
	| "compact"
	| "chatAssistant"
	| "chatUser"
	| "composer"
	| "codeBlock";

const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 32;

export const APP_SETTINGS_DEFAULTS = {
	theme: "auto" as ThemeMode,
	themeFamily: "slate" as ThemeFamily,
	typographyPreset: "default" as TypographyPreset,
	fontFamilyDisplay: "",
	fontFamily: "",
	fontFamilyContent: "",
	fontFamilyMono: "",
	"fontSize.interface": 14,
	"fontSize.compact": 13,
	// Retained as a read-only migration source for existing installations.
	"fontSize.sidebar": 13,
	"fontSize.chatAssistant": 14,
	"fontSize.chatUser": 14,
	"fontSize.composer": 14,
	"fontSize.codeBlock": 13,
	defaultCwd: "",
	httpProxy: "",
	httpsProxy: "",
	noProxy: "",
} as const;

const TYPOGRAPHY_PRESETS = new Set<TypographyPreset>(["default", "theme"]);

export function getTypographyPreset(
	settings: Record<string, unknown>,
): TypographyPreset {
	const value = settings.typographyPreset;
	return typeof value === "string" &&
		TYPOGRAPHY_PRESETS.has(value as TypographyPreset)
		? (value as TypographyPreset)
		: APP_SETTINGS_DEFAULTS.typographyPreset;
}

const FONT_FAMILY_KEY: Record<FontFamilyRegion, AppSettingsKey> = {
	display: "fontFamilyDisplay",
	interface: "fontFamily",
	content: "fontFamilyContent",
	mono: "fontFamilyMono",
};

export function getFontFamily(
	settings: Record<string, unknown>,
	region: FontFamilyRegion,
): string {
	const value = settings[FONT_FAMILY_KEY[region]];
	return typeof value === "string" ? value.trim() : "";
}

const FONT_SIZE_KEY: Record<FontSizeRegion, AppSettingsKey> = {
	interface: "fontSize.interface",
	compact: "fontSize.compact",
	chatAssistant: "fontSize.chatAssistant",
	chatUser: "fontSize.chatUser",
	composer: "fontSize.composer",
	codeBlock: "fontSize.codeBlock",
};

export function getFontSize(
	settings: Record<string, unknown>,
	region: FontSizeRegion,
): number {
	const key = FONT_SIZE_KEY[region];
	const candidate =
		region === "compact" && settings[key] === undefined
			? settings["fontSize.sidebar"]
			: settings[key];
	const fallback = APP_SETTINGS_DEFAULTS[key] as number;
	if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
		return fallback;
	}
	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, candidate));
}
```

Remove `getFontFamilyMono`. In `FontSettings.tsx`, replace `getFontFamily(settings)` with `getFontFamily(settings, "interface")` and `getFontFamilyMono(settings)` with `getFontFamily(settings, "mono")`. Make the same two replacements in `SettingsApplier.tsx`. These are temporary compile-preserving call-site changes; Tasks 3 and 4 replace the surrounding projection/UI structure.

- [ ] **Step 5: Run focused and integration tests**

Run:

```bash
npm test -- tests/unit/app-settings-keys.test.ts tests/integration/app-settings-repo.test.ts tests/integration/ipc-router.test.ts
```

Expected: PASS with the legacy `fontSize.sidebar` repository/IPC tests still green.

- [ ] **Step 6: Run typecheck, inspect impact, and commit**

Run:

```bash
npm run typecheck
```

Expected: PASS. Then run GitNexus `detect_changes` and commit:

```bash
git add src/shared/app-settings-keys.ts tests/unit/app-settings-keys.test.ts src/renderer/components/FontSettings.tsx src/renderer/components/SettingsApplier.tsx
git commit -m "feat: define semantic typography settings"
```

---

## Task 2: Establish canonical CSS tokens and semantic role classes

**Files:**
- Modify: `src/renderer/styles.css:1-516`
- Create: `tests/unit/typography-css.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for `SettingsApplier` and `App`, then inspect their theme-switching execution flow and GitNexus context before the CSS-only edit. If the index exposes `.font-display` as a symbol, inspect it too; otherwise do not treat the selector as a required symbol target. Warn before proceeding if either executable flow is rated HIGH or CRITICAL.

- [ ] **Step 2: Write the failing CSS contract test**

Create:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/renderer/styles.css", "utf8");

const roleSelectors = [
	".type-view-title",
	".type-section-heading",
	".type-body",
	".type-control",
	".type-label",
	".type-metadata",
	".type-overline",
	".type-status",
	".type-code",
];

describe("typography CSS contract", () => {
	it("defines the consistent default family system", () => {
		expect(css).toMatch(/--font-display:\s*"Bricolage Grotesque Variable"/);
		expect(css).toMatch(/--font-interface:\s*"Inter Variable"/);
		expect(css).toContain("--font-content: var(--font-interface)");
		expect(css).toMatch(/--font-mono:\s*"JetBrains Mono Variable"/);
	});

	it("keeps theme typography opt-in", () => {
		expect(css).toContain('html[data-typography-preset="theme"]');
		expect(css).toContain("--theme-font-display");
		expect(css).toContain("--theme-font-interface");
		expect(css).toContain("--theme-font-content");
		expect(css).toContain("--theme-font-mono");
	});

	it.each(roleSelectors)("defines %s", (selector) => {
		expect(css).toContain(selector);
	});

	it("defines behavior modifiers", () => {
		for (const selector of [
			".type-compact",
			".type-assistant",
			".type-user",
			".type-composer",
			".type-tabular",
			".type-ellipsis",
			".type-technical-wrap",
		]) {
			expect(css).toContain(selector);
		}
	});
});
```

- [ ] **Step 3: Run the test and verify failure**

```bash
npm test -- tests/unit/typography-css.test.ts
```

Expected: FAIL because the canonical tokens and role selectors do not exist.

- [ ] **Step 4: Replace family resolution with default and theme tokens**

Keep the existing font imports for now. In `:root`, define:

```css
:root {
	--font-display:
		"Bricolage Grotesque Variable", "Bricolage Grotesque", "Inter Variable",
		system-ui, sans-serif;
	--font-interface:
		"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, system-ui,
		sans-serif;
	--font-content: var(--font-interface);
	--font-mono:
		"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular,
		Menlo, monospace;

	--theme-font-display:
		"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, system-ui,
		sans-serif;
	--theme-font-interface: var(--theme-font-display);
	--theme-font-content: var(--theme-font-interface);
	--theme-font-mono:
		"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular,
		monospace;

	--font-size-interface: 14px;
	--font-size-compact: 13px;
	--font-size-chat-assistant: 14px;
	--font-size-chat-user: 14px;
	--font-size-composer: 14px;
	--font-size-code-block: 13px;

	/* Temporary compatibility aliases removed in Task 9. */
	--font-family: var(--font-interface);
	--font-body: var(--font-content);
	--font-family-mono: var(--font-mono);
	--font-size-sidebar: var(--font-size-compact);
}

html[data-typography-preset="theme"] {
	--font-display: var(--theme-font-display);
	--font-interface: var(--theme-font-interface);
	--font-content: var(--theme-font-content);
	--font-mono: var(--theme-font-mono);
}
```

Rename each theme family’s current family declarations to the four `--theme-font-*` tokens. Keep the temporary `:root` aliases shown above so every intermediate commit remains functional: App/body keeps honoring `--font-family`, NoteEditor resolves through `--font-body`, ToolBlock resolves through `--font-family-mono`, and WorkspaceSidebar resolves through `--font-size-sidebar`. Task 9 removes the aliases after Tasks 5–8 migrate every consumer. Set each theme’s Content token equal to its Interface family.

Change `body` to:

```css
body {
	margin: 0;
	font-family: var(--font-family, var(--font-interface));
	font-size: var(--font-size-interface);
	line-height: 1.5;
	background: var(--app-bg);
	color: var(--app-fg);
	font-feature-settings: "ss01", "ss02", "cv11";
}
```

- [ ] **Step 5: Add semantic role and behavior classes**

Add inside `@layer components`:

```css
.type-view-title {
	font-family: var(--font-display);
	font-size: clamp(16px, calc(var(--font-size-interface) + 6px), 38px);
	font-weight: 650;
	line-height: 1.4;
	color: var(--text-primary);
}
.type-section-heading {
	font-family: var(--font-interface);
	font-size: clamp(14px, calc(var(--font-size-interface) + 2px), 34px);
	font-weight: 600;
	line-height: 1.5;
	color: var(--text-primary);
}
.type-body {
	font-family: var(--font-content);
	font-size: var(--font-size-interface);
	font-weight: 400;
	line-height: 1.5714;
	color: var(--text-primary);
}
.type-control,
.type-label {
	font-family: var(--font-interface);
	font-size: clamp(12px, calc(var(--font-size-interface) - 1px), 31px);
	font-weight: 500;
	line-height: 1.3846;
}
.type-metadata {
	font-family: var(--font-interface);
	font-size: clamp(11px, calc(var(--font-size-interface) - 2px), 30px);
	font-weight: 400;
	line-height: 1.3333;
	color: var(--text-muted);
}
.type-overline {
	font-family: var(--font-interface);
	font-size: clamp(11px, calc(var(--font-size-interface) - 3px), 29px);
	font-weight: 600;
	line-height: 1.4545;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--text-faint);
}
.type-status {
	font-family: var(--font-interface);
	font-size: clamp(12px, calc(var(--font-size-interface) - 1px), 31px);
	font-weight: 400;
	line-height: 1.3846;
}
.type-code {
	font-family: var(--font-mono);
	font-size: var(--font-size-code-block);
	font-weight: 400;
	line-height: 1.5385;
}
.type-compact { font-size: var(--font-size-compact); }
.type-assistant { font-size: var(--font-size-chat-assistant); }
.type-user { font-size: var(--font-size-chat-user); }
.type-composer { font-size: var(--font-size-composer); }
.type-tabular { font-variant-numeric: tabular-nums; }
.type-ellipsis {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.type-technical-wrap {
	overflow-wrap: anywhere;
	word-break: break-word;
}
```

Remove `.font-display`; the semantic View title role replaces it.

- [ ] **Step 6: Run focused tests and CSS diff checks**

```bash
npm test -- tests/unit/typography-css.test.ts tests/unit/scrollbar-theme-css.test.ts
npm run typecheck
npm run lint
```

Expected: PASS. Confirm theme color tokens and scrollbar tests are unchanged.

- [ ] **Step 7: Inspect impact and commit**

Run GitNexus `detect_changes`, confirm only global styling/theme flows changed, then:

```bash
git add src/renderer/styles.css tests/unit/typography-css.test.ts
git commit -m "feat: add semantic typography tokens"
```

---

## Task 3: Project typography settings onto the document root

**Files:**
- Modify: `src/renderer/components/SettingsApplier.tsx:1-85`
- Create: `tests/unit/settings-applier.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for `SettingsApplier` and `effectiveTheme`.

- [ ] **Step 2: Write the failing jsdom test**

Create a jsdom test that mocks `useSettings`, renders `SettingsApplier`, and verifies the exact root contract:

```ts
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	settings: { data: { settings: {} as Record<string, unknown> } },
}));

vi.mock("../../src/renderer/queries", () => ({
	useSettings: () => mocks.settings,
}));

import { SettingsApplier } from "../../src/renderer/components/SettingsApplier";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	document.documentElement.removeAttribute("style");
	delete document.documentElement.dataset.typographyPreset;
});

afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
});

async function render() {
	await act(async () => root.render(React.createElement(SettingsApplier)));
}

describe("SettingsApplier typography", () => {
	it("applies the default preset and six sizes", async () => {
		mocks.settings.data.settings = {};
		await render();
		const html = document.documentElement;
		expect(html.dataset.typographyPreset).toBe("default");
		expect(html.style.getPropertyValue("--font-size-interface")).toBe("14px");
		expect(html.style.getPropertyValue("--font-size-compact")).toBe("13px");
		expect(html.style.getPropertyValue("--font-size-code-block")).toBe("13px");
		expect(html.style.getPropertyValue("--font-display")).toBe("");
	});

	it("applies and removes all four family overrides", async () => {
		mocks.settings.data.settings = {
			typographyPreset: "theme",
			fontFamilyDisplay: "Display Face",
			fontFamily: "Interface Face",
			fontFamilyContent: "Content Face",
			fontFamilyMono: "Mono Face",
		};
		await render();
		const html = document.documentElement;
		expect(html.dataset.typographyPreset).toBe("theme");
		expect(html.style.getPropertyValue("--font-display")).toBe("Display Face");
		expect(html.style.getPropertyValue("--font-interface")).toBe("Interface Face");
		expect(html.style.getPropertyValue("--font-content")).toBe("Content Face");
		expect(html.style.getPropertyValue("--font-mono")).toBe("Mono Face");

		mocks.settings.data.settings = {};
		await render();
		expect(html.style.getPropertyValue("--font-display")).toBe("");
		expect(html.style.getPropertyValue("--font-interface")).toBe("");
		expect(html.style.getPropertyValue("--font-content")).toBe("");
		expect(html.style.getPropertyValue("--font-mono")).toBe("");
	});
});
```

- [ ] **Step 3: Run and verify failure**

```bash
npm test -- tests/unit/settings-applier.test.ts
```

Expected: FAIL because the component still writes old variables and lacks `data-typography-preset`.

- [ ] **Step 4: Implement the projection contract**

Use these mappings:

```ts
const FAMILY_VAR: Record<FontFamilyRegion, string> = {
	display: "--font-display",
	interface: "--font-interface",
	content: "--font-content",
	mono: "--font-mono",
};

const REGIONS: FontSizeRegion[] = [
	"interface",
	"compact",
	"chatAssistant",
	"chatUser",
	"composer",
	"codeBlock",
];

const REGION_VAR: Record<FontSizeRegion, string> = {
	interface: "--font-size-interface",
	compact: "--font-size-compact",
	chatAssistant: "--font-size-chat-assistant",
	chatUser: "--font-size-chat-user",
	composer: "--font-size-composer",
	codeBlock: "--font-size-code-block",
};
```

Inside the font effect:

```ts
root.dataset.typographyPreset = getTypographyPreset(settings);
for (const region of ["display", "interface", "content", "mono"] as const) {
	const family = getFontFamily(settings, region);
	const property = FAMILY_VAR[region];
	if (family) root.style.setProperty(property, family);
	else root.style.removeProperty(property);
}
for (const region of REGIONS) {
	root.style.setProperty(REGION_VAR[region], `${getFontSize(settings, region)}px`);
}
```

Do not write inline values for `--font-family`, `--font-family-mono`, `--font-body`, or `--font-size-sidebar`. The temporary stylesheet aliases from Task 2 remain until Task 9 so intermediate commits are independently usable.

- [ ] **Step 5: Run tests, typecheck, inspect impact, and commit**

```bash
npm test -- tests/unit/settings-applier.test.ts tests/unit/app-settings-keys.test.ts
npm run typecheck
```

Then run GitNexus `detect_changes` and commit:

```bash
git add src/renderer/components/SettingsApplier.tsx tests/unit/settings-applier.test.ts
git commit -m "feat: apply typography tokens at runtime"
```

---

## Task 4: Replace the Font settings UI with semantic controls

**Files:**
- Modify: `src/renderer/components/FontSettings.tsx:1-163`
- Create: `tests/unit/font-settings.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for `FontSettings` and `FamilyControl`.

- [ ] **Step 2: Write the failing UI test**

Create a jsdom test using the same React root pattern as Task 3. Mock `useSettings` and `useSetSetting`; assert:

```ts
expect(container.textContent).toContain("Typography preset");
expect(container.textContent).toContain("Display font family");
expect(container.textContent).toContain("Interface font family");
expect(container.textContent).toContain("Content font family");
expect(container.textContent).toContain("Monospace font family");
expect(container.textContent).toContain("Interface scale");
expect(container.textContent).toContain("Compact / navigation");
expect(container.textContent).toContain("Assistant content");
expect(container.textContent).toContain("User content");
expect(container.textContent).toContain("Composer");
expect(container.textContent).toContain("Code / data");
expect(container.textContent).toContain("Theme default");
expect(container.textContent).not.toContain("Default (Inter)");
```

Change the preset select and assert:

```ts
expect(mocks.setSetting.mutate).toHaveBeenCalledWith({
	key: "typographyPreset",
	value: "theme",
});
```

- [ ] **Step 3: Run and verify failure**

```bash
npm test -- tests/unit/font-settings.test.ts
```

Expected: FAIL because the current panel has two family controls, five scales, and inaccurate labels.

- [ ] **Step 4: Implement four family controls and six scales**

Use these descriptors:

```ts
const FAMILY_REGIONS = [
	{ id: "display", label: "Display font family", key: "fontFamilyDisplay" },
	{ id: "interface", label: "Interface font family", key: "fontFamily" },
	{ id: "content", label: "Content font family", key: "fontFamilyContent" },
	{ id: "mono", label: "Monospace font family", key: "fontFamilyMono" },
] as const;

const REGIONS: { id: FontSizeRegion; label: string; key: AppSettingsKey }[] = [
	{ id: "interface", label: "Interface scale", key: "fontSize.interface" },
	{ id: "compact", label: "Compact / navigation", key: "fontSize.compact" },
	{ id: "chatAssistant", label: "Assistant content", key: "fontSize.chatAssistant" },
	{ id: "chatUser", label: "User content", key: "fontSize.chatUser" },
	{ id: "composer", label: "Composer", key: "fontSize.composer" },
	{ id: "codeBlock", label: "Code / data", key: "fontSize.codeBlock" },
];

const MIN_SIZE = 11;
const MAX_SIZE = 32;
```

Add a preset select before family controls:

```tsx
<label className="flex flex-col gap-1 type-label">
	Typography preset
	<select
		value={getTypographyPreset(settings)}
		onChange={(event) =>
			setSetting.mutate({
				key: "typographyPreset",
				value: event.target.value,
			})
		}
		className="surface-row rounded px-2 py-1 type-control"
	>
		<option value="default">Consistent default</option>
		<option value="theme">Follow color theme</option>
	</select>
</label>
```

Use these exact curated stacks for Display, Interface, and Content:

```ts
const PROPORTIONAL_FAMILIES = [
	"",
	'"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif',
	'"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
	'"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif',
	'"Instrument Serif", Georgia, serif',
	'"Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif',
	'"Spline Sans Variable", "Spline Sans", system-ui, sans-serif',
	'"Familjen Grotesk Variable", "Familjen Grotesk", system-ui, sans-serif',
	"system-ui, -apple-system, sans-serif",
	'Georgia, "Times New Roman", serif',
];

const MONO_FAMILIES = [
	"",
	'"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
	'"IBM Plex Mono", ui-monospace, monospace',
	'"Spline Sans Mono Variable", "Spline Sans Mono", ui-monospace, monospace',
	"ui-monospace, SFMono-Regular, Menlo, monospace",
];
```

Keep the free-text input as the custom-family path. Every empty option label must be exactly **Theme default**.

Apply `.type-section-heading`, `.type-label`, `.type-control`, and `.type-metadata type-tabular` within this panel; do not leave `text-sm`, `text-xs`, or `text-base` role choices.

- [ ] **Step 5: Run tests and commit**

```bash
npm test -- tests/unit/font-settings.test.ts tests/unit/app-settings-keys.test.ts
npm run typecheck
npm run lint
```

Run GitNexus `detect_changes`, then:

```bash
git add src/renderer/components/FontSettings.tsx tests/unit/font-settings.test.ts
git commit -m "feat: expose semantic typography controls"
```

---

## Task 5: Migrate shell, navigation, lists, and hierarchy

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/WorkspaceSidebar.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/ChatBreadcrumb.tsx`
- Modify: `src/renderer/components/BreadcrumbBar.tsx`
- Modify: `src/renderer/components/NotesList.tsx`
- Modify: `src/renderer/components/PromptsList.tsx`
- Modify: `src/renderer/components/SkillsList.tsx`
- Modify: `src/renderer/components/ExtensionsList.tsx`
- Modify: `src/renderer/components/PromptDetail.tsx`
- Modify: `src/renderer/components/SkillDetail.tsx`
- Modify: `src/renderer/components/ExtensionDetail.tsx`
- Modify: `src/renderer/components/DiagnosticsPanel.tsx`
- Modify: `tests/unit/sidebar-tree-rails.test.ts`
- Create: `tests/unit/typography-navigation-source.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for every exported component listed above. Pay special attention to `WorkspaceSidebar` and `SessionRow`; stop if either is HIGH/CRITICAL.

- [ ] **Step 2: Write failing shell/navigation role tests first**

Add this assertion to `sidebar-tree-rails.test.ts`:

```ts
it("uses semantic compact, overline, label, and metadata roles", () => {
	const source = readFileSync(
		"src/renderer/components/WorkspaceSidebar.tsx",
		"utf8",
	);
	expect(source).toContain("type-compact");
	expect(source).toContain("type-overline");
	expect(source).toContain("type-label");
	expect(source).toContain("type-metadata");
	expect(source).not.toContain("text-[10px]");
	expect(source).not.toContain("--font-size-sidebar");
});
```

Create `typography-navigation-source.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contracts: Record<string, string[]> = {
	"src/renderer/components/NotesList.tsx": ["type-overline", "type-label", "type-metadata"],
	"src/renderer/components/PromptsList.tsx": ["type-overline", "type-label", "type-metadata"],
	"src/renderer/components/SkillsList.tsx": ["type-overline", "type-label", "type-metadata"],
	"src/renderer/components/ExtensionsList.tsx": ["type-overline", "type-label", "type-metadata"],
	"src/renderer/components/PromptDetail.tsx": ["type-section-heading", "type-label", "type-control"],
	"src/renderer/components/SkillDetail.tsx": ["type-section-heading", "type-control"],
	"src/renderer/components/ExtensionDetail.tsx": ["type-section-heading", "type-control"],
	"src/renderer/components/DiagnosticsPanel.tsx": ["type-section-heading", "type-code", "type-status"],
};

describe("navigation and resource typography", () => {
	it.each(Object.entries(contracts))("%s uses its semantic roles", (file, roles) => {
		const source = readFileSync(file, "utf8");
		for (const role of roles) expect(source).toContain(role);
	});
});
```

Run:

```bash
npm test -- tests/unit/sidebar-tree-rails.test.ts tests/unit/typography-navigation-source.test.ts
```

Expected: FAIL because the semantic roles are not yet applied.

- [ ] **Step 3: Apply the semantic mapping**

Use this exact mapping across the listed files:

| Current concept | Replacement |
|---|---|
| Root app font utility | remove; `body` owns Interface inheritance |
| Workspace/session/list group heading | `type-overline` |
| Workspace/session/file/resource/note row name | `type-label type-compact type-ellipsis` |
| Row count, source, excerpt, cwd, argument hint | `type-metadata` plus `type-ellipsis` where constrained |
| Detail title within an existing pane | `type-section-heading` |
| Diagnostics title | `type-section-heading` |
| Diagnostics time/rule/location | `type-code type-metadata` or `type-code type-technical-wrap` |

Replace the sidebar root with:

```tsx
<div className="flex h-full w-full min-w-0 flex-col gap-px surface-panel p-3 type-compact text-primary">
```

Replace both WORKSPACES and SESSIONS headings with:

```tsx
<div className="type-overline ...">...</div>
```

Remove the 90% session-size inline style. Session rows use the same Compact scale as other navigation rows. Put workspace/session names in constrained spans:

```tsx
<span className="type-label type-compact type-ellipsis">{label}</span>
```

For breadcrumbs, use `type-metadata`, ensure the flex text child has `min-w-0`, apply `type-ellipsis`, and keep the complete path/name in `title` and accessible text.

- [ ] **Step 4: Normalize resource list/detail components**

In Notes, Prompts, Skills, and Extensions:

- group headings → `type-overline`;
- row names → `type-label type-ellipsis`;
- excerpts/source/arguments → `type-metadata type-ellipsis`;
- loading/empty/error → `type-status` plus semantic color;
- detail titles → `type-section-heading`;
- detail field labels → `type-label`;
- detail actions → `type-control`.

Do not change component behavior, data fetching, selection, or keyboard handling.

- [ ] **Step 5: Run focused tests and verify source cleanup**

```bash
npm test -- tests/unit/sidebar-tree-rails.test.ts tests/unit/typography-navigation-source.test.ts
rg -n 'text-\[(9|10)px\]|--font-size-sidebar' \
  src/renderer/App.tsx \
  src/renderer/components/WorkspaceSidebar.tsx \
  src/renderer/components/SessionRow.tsx \
  src/renderer/components/ChatBreadcrumb.tsx \
  src/renderer/components/BreadcrumbBar.tsx \
  src/renderer/components/NotesList.tsx \
  src/renderer/components/PromptsList.tsx \
  src/renderer/components/SkillsList.tsx \
  src/renderer/components/ExtensionsList.tsx \
  src/renderer/components/PromptDetail.tsx \
  src/renderer/components/SkillDetail.tsx \
  src/renderer/components/ExtensionDetail.tsx \
  src/renderer/components/DiagnosticsPanel.tsx
npm run typecheck
```

Expected: test PASS; `rg` returns no matches; typecheck PASS.

- [ ] **Step 6: Inspect impact and commit**

Run GitNexus `detect_changes`, verify only shell/navigation/resource flows changed, then commit:

```bash
git add \
  src/renderer/App.tsx \
  src/renderer/components/WorkspaceSidebar.tsx \
  src/renderer/components/SessionRow.tsx \
  src/renderer/components/ChatBreadcrumb.tsx \
  src/renderer/components/BreadcrumbBar.tsx \
  src/renderer/components/NotesList.tsx \
  src/renderer/components/PromptsList.tsx \
  src/renderer/components/SkillsList.tsx \
  src/renderer/components/ExtensionsList.tsx \
  src/renderer/components/PromptDetail.tsx \
  src/renderer/components/SkillDetail.tsx \
  src/renderer/components/ExtensionDetail.tsx \
  src/renderer/components/DiagnosticsPanel.tsx \
  tests/unit/sidebar-tree-rails.test.ts \
  tests/unit/typography-navigation-source.test.ts
git commit -m "refactor: align navigation typography roles"
```

---

## Task 6: Migrate chat content, code, files, and notes

**Files:**
- Modify: `src/renderer/components/messages/AssistantMessage.tsx`
- Modify: `src/renderer/components/messages/UserMessage.tsx`
- Modify: `src/renderer/components/messages/MessageBranchButton.tsx`
- Modify: `src/renderer/components/messages/MarkdownText.tsx`
- Modify: `src/renderer/components/messages/ToolBlock.tsx`
- Modify: `src/renderer/components/Composer.tsx`
- Modify: `src/renderer/components/SlashPopup.tsx`
- Modify: `src/renderer/components/ChatFooter.tsx`
- Modify: `src/renderer/components/ChatContextBar.tsx`
- Modify: `src/renderer/components/CodeEditor.tsx`
- Modify: `src/renderer/components/FileBrowserPane.tsx`
- Modify: `src/renderer/components/FileTree.tsx`
- Modify: `src/renderer/components/FilePreview.tsx`
- Modify: `src/renderer/components/NoteEditor.tsx`
- Modify: `src/renderer/components/ModelsJsonEditor.tsx`
- Modify: `src/renderer/styles.css` Markdown selectors
- Modify: `tests/unit/markdown-safe-url.test.ts`
- Create: `tests/unit/code-typography-source.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for `MarkdownText`, `ToolBlock`, `CodeEditor`, `Composer`, `FilePreview`, and `NoteEditor` before editing.

- [ ] **Step 2: Write a failing code-family regression test**

Create:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
	"src/renderer/components/messages/MarkdownText.tsx",
	"src/renderer/components/messages/ToolBlock.tsx",
	"src/renderer/components/CodeEditor.tsx",
	"src/renderer/components/FilePreview.tsx",
	"src/renderer/components/ModelsJsonEditor.tsx",
];

const sources = files.map((file) => [file, readFileSync(file, "utf8")] as const);

describe("code typography consumers", () => {
	it.each(sources)("%s uses the canonical code role", (_file, source) => {
		expect(source).toContain("type-code");
	});

	it.each(sources)("%s does not use retired mono paths", (_file, source) => {
		expect(source).not.toContain("--font-family-mono");
		expect(source).not.toMatch(/className=[^\n]*\bfont-mono\b/);
	});
});
```

Run it and confirm failure.

- [ ] **Step 3: Migrate message and composer roles**

Apply:

```tsx
// Assistant message wrapper
<div className="type-body type-assistant">

// User message wrapper
<div className="flex justify-end type-body type-user">

// Composer textarea
<textarea className="... type-body type-composer ..." />

// Composer buttons and slash choices
<button className="... type-control ..." />
```

Assistant/user metadata and branch controls use `type-metadata`; thinking copy uses `type-status italic whitespace-pre-wrap`. Replace all 9/10px message actions with Metadata or Overline roles.

Chat footer/context values use `type-metadata type-tabular`; remove `text-[9px]`, `text-[10px]`, and `text-[11px]`.

- [ ] **Step 4: Migrate every code/data consumer**

`MarkdownText` code renderer:

```tsx
<code {...rest} className={`${className ?? ""} type-code`}>
	{children}
</code>
```

Fenced wrapper:

```tsx
<pre {...rest} className="my-2 overflow-x-auto rounded p-2 surface-row type-code">
	{children}
</pre>
```

`ToolBlock` root and diff use `type-code`; tool section labels use `type-overline`; payload `<pre>` elements add `type-technical-wrap` when horizontal preservation is not required.

`CodeEditor` scroller theme becomes:

```ts
".cm-scroller": {
	fontFamily: "var(--font-mono)",
	fontSize: "var(--font-size-code-block)",
	lineHeight: "1.5385",
},
```

Replace hard-coded `{ dark: true }` with a `MutationObserver` and CodeMirror `Compartment`, so the editor follows the existing `.dark` class without adding a second theme source of truth:

```ts
import { Compartment, EditorState } from "@codemirror/state";

function codeEditorTheme(dark: boolean) {
	return EditorView.theme(
		{
			"&": { height: "100%" },
			".cm-scroller": {
				fontFamily: "var(--font-mono)",
				fontSize: "var(--font-size-code-block)",
				lineHeight: "1.5385",
			},
		},
		{ dark },
	);
}
```

Create one `Compartment` in the mount effect, install `themeCompartment.of(codeEditorTheme(document.documentElement.classList.contains("dark")))`, then observe the root `class` attribute and dispatch:

```ts
view.dispatch({
	effects: themeCompartment.reconfigure(
		codeEditorTheme(document.documentElement.classList.contains("dark")),
	),
});
```

Set the CodeEditor host to `className="flex-1 overflow-hidden type-code"`, satisfying the semantic-role contract while CodeMirror’s internal scroller receives the same canonical variables through its theme. Disconnect the observer in the effect cleanup before destroying the view. Extend `code-typography-source.test.ts` with this regression contract:

```ts
it("reconfigures CodeMirror when the root appearance changes", () => {
	const source = readFileSync("src/renderer/components/CodeEditor.tsx", "utf8");
	expect(source).toContain("Compartment");
	expect(source).toContain("new MutationObserver");
	expect(source).toContain('classList.contains("dark")');
	expect(source).toContain("themeCompartment.reconfigure");
	expect(source).toContain("observer.disconnect()");
	expect(source).not.toContain("{ dark: true }");
});
```

Plain file preview, JSON textarea, IDs, paths intended as literal values, and diagnostic technical fields use `type-code`. Human-readable navigation paths remain `type-metadata`.

- [ ] **Step 5: Normalize Markdown and note prose**

Update `.macpi-markdown` to inherit Content family and use the Body role’s 14/22 default when outside chat. Keep relative Markdown heading sizes but map h1/h2 to Section-heading weight/metrics and h3–h6 to Label hierarchy without applying Display.

Change the note textarea to:

```tsx
<textarea
	...
	className="flex-1 resize-none border-0 bg-transparent p-4 type-body outline-none placeholder-faint"
/>
```

Remove `style={{ fontFamily: "var(--font-body)" }}`.

- [ ] **Step 6: Normalize file rows and states**

File-tree rows use `type-label type-compact`; put the visible filename in `type-ellipsis` with a `title`. File-browser and preview loading/empty/error states use `type-status`. File header/path uses `type-metadata type-ellipsis`.

- [ ] **Step 7: Run focused and broader renderer tests**

```bash
npm test -- \
  tests/unit/code-typography-source.test.ts \
  tests/unit/markdown-safe-url.test.ts \
  tests/unit/chat-footer.test.ts \
  tests/unit/truncate-output.test.ts \
  tests/unit/unified-diff.test.ts \
  tests/pi-integration/composer.test.ts \
  tests/pi-integration/tool-events.test.ts \
  tests/pi-integration/text-streaming.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Inspect impact and commit**

Run GitNexus `detect_changes`, confirm chat, files, notes, and editor flows only, then:

```bash
git add \
  src/renderer/styles.css \
  src/renderer/components/messages/AssistantMessage.tsx \
  src/renderer/components/messages/UserMessage.tsx \
  src/renderer/components/messages/MessageBranchButton.tsx \
  src/renderer/components/messages/MarkdownText.tsx \
  src/renderer/components/messages/ToolBlock.tsx \
  src/renderer/components/Composer.tsx \
  src/renderer/components/SlashPopup.tsx \
  src/renderer/components/ChatFooter.tsx \
  src/renderer/components/ChatContextBar.tsx \
  src/renderer/components/CodeEditor.tsx \
  src/renderer/components/FileBrowserPane.tsx \
  src/renderer/components/FileTree.tsx \
  src/renderer/components/FilePreview.tsx \
  src/renderer/components/NoteEditor.tsx \
  src/renderer/components/ModelsJsonEditor.tsx \
  tests/unit/markdown-safe-url.test.ts \
  tests/unit/code-typography-source.test.ts
git commit -m "refactor: unify content and code typography"
```

---

## Task 7: Migrate settings, dialogs, menus, and model surfaces

**Files:**
- Modify: `src/renderer/components/SettingsDialog.tsx`
- Modify: `src/renderer/components/ThemeSettings.tsx`
- Modify: `src/renderer/components/DefaultsSettings.tsx`
- Modify: `src/renderer/components/ProvidersSettings.tsx`
- Modify: `src/renderer/components/ModelsSettings.tsx`
- Modify: `src/renderer/components/DefaultModelSelector.tsx`
- Modify: `src/renderer/components/DefaultModelMenu.tsx`
- Modify: `src/renderer/components/ChatModelMenu.tsx`
- Modify: `src/renderer/components/ChatThinkingMenu.tsx`
- Modify: `src/renderer/components/CapabilitySettings.tsx`
- Modify: `src/renderer/components/ImportPiAuthModels.tsx`
- Modify: `src/renderer/components/ConfirmDialog.tsx`
- Modify: `src/renderer/components/CreateWorkspaceDialog.tsx`
- Modify: `src/renderer/components/CreateSessionDialog.tsx`
- Modify: `src/renderer/components/HelpDialog.tsx`
- Modify: `src/renderer/components/OAuthLoginDialog.tsx`
- Modify: `src/renderer/components/UninstallResourceDialog.tsx`
- Modify: `src/renderer/components/dialogs/InstallSkillDialog.tsx`
- Modify: `src/renderer/components/ContextMenu.tsx`
- Modify: `src/renderer/components/RowMenu.tsx`
- Modify: `tests/unit/models-settings.test.ts`
- Modify: `tests/unit/providers-settings.test.ts`
- Modify: `tests/unit/default-model-selector.test.ts`
- Modify: `tests/unit/chat-model-menu.test.ts`
- Modify: `tests/unit/chat-thinking-menu.test.ts`
- Modify: `tests/unit/oauth-login-dialog.test.ts`
- Create: `tests/unit/import-pi-auth-models-typography.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for each exported settings/dialog/menu component before editing. Group only symbols reported as LOW/MEDIUM; warn before any HIGH/CRITICAL change.

- [ ] **Step 2: Add semantic-role assertions to existing component tests**

Extend `tests/unit/models-settings.test.ts`, `providers-settings.test.ts`, `default-model-selector.test.ts`, `chat-model-menu.test.ts`, `chat-thinking-menu.test.ts`, and `oauth-login-dialog.test.ts` with focused assertions such as:

```ts
expect(container.querySelector(".type-view-title")).not.toBeNull();
expect(container.querySelector(".type-section-heading")).not.toBeNull();
expect(container.querySelector(".type-label")).not.toBeNull();
expect(container.querySelector(".type-control")).not.toBeNull();
expect(container.querySelector(".type-metadata")).not.toBeNull();
expect(container.querySelector(".type-status")).not.toBeNull();
```

Use only roles actually rendered by each fixture. Also create `tests/unit/import-pi-auth-models-typography.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	"src/renderer/components/ImportPiAuthModels.tsx",
	"utf8",
);

describe("ImportPiAuthModels typography", () => {
	it("uses semantic roles for labels, paths, controls, and status", () => {
		for (const role of [
			"type-label",
			"type-code",
			"type-control",
			"type-status",
			"type-technical-wrap",
		]) {
			expect(source).toContain(role);
		}
	});
});
```

Run the six existing focused tests plus this new test and verify at least one assertion fails per migrated component family.

- [ ] **Step 3: Normalize settings hierarchy**

Apply this mapping:

| Surface | Role |
|---|---|
| Provider/model destination heading | View title |
| Settings dialog active panel title | Section heading |
| Provider form/detail heading | View title or Section heading according to nesting |
| Provider overlay/OAuth title | Section heading |
| Field label | Label |
| Input/select/button/navigation item | Control |
| Help/source/count/description | Metadata |
| Settings navigation group | Overline |
| Loading/empty/error | Status |
| Literal provider/model IDs and paths | Code/data |

Do not preserve the current 14/16/18/20px ad hoc heading choices; the role classes own their metrics.

- [ ] **Step 4: Normalize model menus without changing behavior**

Both model menus must use the same roles even if their layout differs:

```tsx
<input className="... type-control" />
<div className="type-overline">Favourites</div>
<button role="option" className="... type-control">
	<span className="type-ellipsis">{model.name}</span>
	<span className="type-code type-metadata type-ellipsis">{model.id}</span>
</button>
```

Add `min-w-0` and `type-ellipsis` to DefaultModelMenu option content, fixing the current inherited 16px/unbounded-ID discrepancy. Preserve focus restoration, Escape/outside dismissal, pending state, favourites, and selection logic.

- [ ] **Step 5: Normalize dialogs and menus**

- dialog titles → `type-section-heading`;
- dialog body → `type-body` or `type-status` for feedback;
- form labels → `type-label`;
- actions and menu items → `type-control`;
- group labels → `type-overline`;
- descriptions and shortcuts → `type-metadata`;
- URLs, paths, package names, event logs → `type-code type-technical-wrap`;
- menu labels remain one line with `type-ellipsis` and a title/accessibility fallback.

Add `max-w-[calc(100vw-2rem)]` to every fixed-width dialog container in `ConfirmDialog.tsx`, `CreateWorkspaceDialog.tsx`, `CreateSessionDialog.tsx`, `OAuthLoginDialog.tsx`, `UninstallResourceDialog.tsx`, and `dialogs/InstallSkillDialog.tsx`. Keep the existing `w-*` or `max-w-*` class alongside this viewport cap. Do not change dialog state machines or IPC behavior.

- [ ] **Step 6: Run focused tests and cleanup search**

```bash
npm test -- \
  tests/unit/models-settings.test.ts \
  tests/unit/providers-settings.test.ts \
  tests/unit/default-model-selector.test.ts \
  tests/unit/chat-model-menu.test.ts \
  tests/unit/chat-thinking-menu.test.ts \
  tests/unit/oauth-login-dialog.test.ts \
  tests/unit/import-pi-auth-models-typography.test.ts
rg -n 'text-\[(9|10)px\]|tracking-(wide|wider|widest).*uppercase|font-mono' \
  src/renderer/components/SettingsDialog.tsx \
  src/renderer/components/ThemeSettings.tsx \
  src/renderer/components/DefaultsSettings.tsx \
  src/renderer/components/ProvidersSettings.tsx \
  src/renderer/components/ModelsSettings.tsx \
  src/renderer/components/DefaultModelSelector.tsx \
  src/renderer/components/DefaultModelMenu.tsx \
  src/renderer/components/ChatModelMenu.tsx \
  src/renderer/components/ChatThinkingMenu.tsx \
  src/renderer/components/ImportPiAuthModels.tsx \
  src/renderer/components/ConfirmDialog.tsx \
  src/renderer/components/CreateWorkspaceDialog.tsx \
  src/renderer/components/CreateSessionDialog.tsx \
  src/renderer/components/HelpDialog.tsx \
  src/renderer/components/OAuthLoginDialog.tsx \
  src/renderer/components/UninstallResourceDialog.tsx \
  src/renderer/components/dialogs/InstallSkillDialog.tsx \
  src/renderer/components/ContextMenu.tsx \
  src/renderer/components/RowMenu.tsx
npm run typecheck
npm run lint
```

Expected: tests PASS; cleanup search returns no matches except intentional icon-only sizing, which must be documented inline.

- [ ] **Step 7: Inspect impact and commit**

Run GitNexus `detect_changes`, verify settings/dialog/menu/model flows only, then:

```bash
git add \
  src/renderer/components/SettingsDialog.tsx \
  src/renderer/components/ThemeSettings.tsx \
  src/renderer/components/DefaultsSettings.tsx \
  src/renderer/components/ProvidersSettings.tsx \
  src/renderer/components/ModelsSettings.tsx \
  src/renderer/components/DefaultModelSelector.tsx \
  src/renderer/components/DefaultModelMenu.tsx \
  src/renderer/components/ChatModelMenu.tsx \
  src/renderer/components/ChatThinkingMenu.tsx \
  src/renderer/components/CapabilitySettings.tsx \
  src/renderer/components/ImportPiAuthModels.tsx \
  src/renderer/components/ConfirmDialog.tsx \
  src/renderer/components/CreateWorkspaceDialog.tsx \
  src/renderer/components/CreateSessionDialog.tsx \
  src/renderer/components/HelpDialog.tsx \
  src/renderer/components/OAuthLoginDialog.tsx \
  src/renderer/components/UninstallResourceDialog.tsx \
  src/renderer/components/dialogs/InstallSkillDialog.tsx \
  src/renderer/components/ContextMenu.tsx \
  src/renderer/components/RowMenu.tsx \
  tests/unit/models-settings.test.ts \
  tests/unit/providers-settings.test.ts \
  tests/unit/default-model-selector.test.ts \
  tests/unit/chat-model-menu.test.ts \
  tests/unit/chat-thinking-menu.test.ts \
  tests/unit/oauth-login-dialog.test.ts \
  tests/unit/import-pi-auth-models-typography.test.ts
git commit -m "refactor: standardize settings and dialog typography"
```

---

## Task 8: Normalize banners, toast, and remaining status surfaces

**Files:**
- Modify: `src/renderer/components/banners/RetryBanner.tsx`
- Modify: `src/renderer/components/banners/CompactionBanner.tsx`
- Modify: `src/renderer/components/banners/SkillsChangedBanner.tsx`
- Modify: `src/renderer/components/banners/ErrorBanner.tsx`
- Modify: `src/renderer/components/banners/QueuePills.tsx`
- Modify: `src/renderer/components/ToastHost.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`
- Modify: `tests/unit/skills-changed-banner.test.ts`
- Modify: `tests/unit/timeline-state-error-banner.test.ts`
- Modify: `tests/pi-integration/banners.test.ts`
- Modify: `tests/pi-integration/restore.test.ts`

- [ ] **Step 1: Run impact analysis**

Run upstream impact for each banner, `ToastHost`, and `ChatPane`.

- [ ] **Step 2: Write failing semantic and accessibility assertions**

Extend banner tests to require `.type-status`; add a source assertion that every asynchronous feedback component has an appropriate `role="status"`, `role="alert"`, or existing live-region equivalent.

Example:

```ts
expect(container.querySelector(".type-status")).not.toBeNull();
expect(container.querySelector('[role="status"], [role="alert"]')).not.toBeNull();
```

Run and verify failure:

```bash
npm test -- \
  tests/unit/skills-changed-banner.test.ts \
  tests/unit/timeline-state-error-banner.test.ts \
  tests/pi-integration/banners.test.ts \
  tests/pi-integration/restore.test.ts
```

Expected: at least one semantic-role or live-region assertion fails before the component changes.

- [ ] **Step 3: Apply Status, Overline, Control, and wrapping roles**

- all status bodies → `type-status`;
- error/status labels → `type-overline`;
- retry/reload/clear/remove actions → `type-control`;
- queue counts → `type-metadata type-tabular`;
- generated error text → `type-technical-wrap`;
- toast → `type-status type-technical-wrap max-w-[calc(100vw-2rem)] text-left`.

Raise all 10/11px queue/banner text to semantic role metrics. Keep semantic colors and existing backgrounds.

Normalize ChatPane no-session/loading/attach-error states to `type-status`; mark the session ID `type-code type-technical-wrap`.

- [ ] **Step 4: Run tests and commit**

```bash
npm test -- \
  tests/unit/skills-changed-banner.test.ts \
  tests/unit/timeline-state-error-banner.test.ts \
  tests/pi-integration/banners.test.ts \
  tests/pi-integration/restore.test.ts
npm run typecheck
npm run lint
```

Run GitNexus `detect_changes`, then:

```bash
git add src/renderer/components/banners src/renderer/components/ToastHost.tsx src/renderer/components/ChatPane.tsx tests
git commit -m "refactor: unify feedback typography"
```

---

## Task 9: Add final source guardrails and remove dead font assets

**Files:**
- Create: `tests/unit/typography-source-contract.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/renderer/styles.css:1-21`

- [ ] **Step 1: Run impact analysis**

Run impact analysis for the renderer stylesheet and check package/font loading flows. Confirm Fraunces, Plus Jakarta Sans, Gloock, and Manrope have no runtime consumers with:

```bash
rg -n '(Fraunces|Plus Jakarta Sans|Gloock|Manrope|fraunces|plus-jakarta|gloock|manrope)' \
  src tests package.json
```

Expected before cleanup: matches only font imports/dependencies and documentation/tests explicitly describing removal.

- [ ] **Step 2: Write the failing source contract**

Create:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return rendererSources(path);
		return /\.(?:css|tsx?)$/.test(entry.name) ? [path] : [];
	});
}

const sourceFiles = rendererSources("src/renderer");
const joined = sourceFiles
	.map((file) => readFileSync(file, "utf8"))
	.join("\n");

describe("typography source guardrails", () => {
	it("does not use retired font variables", () => {
		for (const retired of [
			"--font-family",
			"--font-family-mono",
			"--font-body",
			"--font-size-sidebar",
		]) {
			expect(joined).not.toContain(retired);
		}
	});

	it("does not use sub-11px text utilities", () => {
		expect(joined).not.toMatch(/text-\[(?:[0-9]|10)px\]/);
	});

	it("defines all semantic roles", () => {
		for (const role of [
			"type-view-title",
			"type-section-heading",
			"type-body",
			"type-control",
			"type-label",
			"type-metadata",
			"type-overline",
			"type-status",
			"type-code",
		]) {
			expect(joined).toContain(role);
		}
	});
});
```

Run and verify any remaining migration misses fail the test.

- [ ] **Step 3: Remove remaining contract violations and compatibility aliases**

Use `rg` to find and replace any remaining retired variables and 9/10px utilities with the approved semantic role. Remove the four temporary `:root` aliases from Task 2: `--font-family`, `--font-body`, `--font-family-mono`, and `--font-size-sidebar`. Change the body declaration from `var(--font-family, var(--font-interface))` to `var(--font-interface)`. Do not exempt text content; only icon geometry may remain at arbitrary dimensions, and it must use width/height rather than font-size.

- [ ] **Step 4: Remove verified-unused font packages**

Run:

```bash
npm uninstall \
  @fontsource-variable/fraunces \
  @fontsource/plus-jakarta-sans \
  @fontsource/gloock \
  @fontsource-variable/manrope
```

Remove their imports from `styles.css`. Keep every font used by the default system or optional theme preset.

- [ ] **Step 5: Run focused and full automated validation**

```bash
npm test -- tests/unit/typography-source-contract.test.ts tests/unit/typography-css.test.ts
npm test
npm run typecheck
npm run lint
npm run package
```

Expected: all tests PASS, typecheck/lint PASS, Electron package succeeds, and no missing-font resolution errors appear.

- [ ] **Step 6: Inspect impact and commit**

Run GitNexus `detect_changes`, confirm removal affects only expected font assets and renderer typography flows, then:

```bash
git add package.json package-lock.json src/renderer/styles.css tests/unit/typography-source-contract.test.ts
git commit -m "chore: remove unused typography assets"
```

---

## Task 10: Verify the complete visual matrix and update the guide

**Files:**
- Modify: `docs/font-usage.md`
- No production code unless verification exposes a defect

- [ ] **Step 1: Start the app and verify default typography**

Run:

```bash
npm start
```

Verify these surfaces in both light and dark mode:

- workspace/session navigation;
- assistant/user Markdown, inline/fenced code, tool output, and diffs;
- composer and slash popup;
- files, previews, CodeMirror, and notes;
- every settings category;
- create/confirm/OAuth/install dialogs;
- model/thinking/context menus;
- banners, queue, toast, empty/loading/error states.

Expected: default families are Bricolage Grotesque for View titles, Inter for Interface/Content, and JetBrains Mono for Code/data.

- [ ] **Step 2: Verify preset and theme matrix**

For Slate, Carbon, Ember, Marine, and Punch:

1. select **Consistent default** and confirm only colors change;
2. select **Follow color theme** and confirm each optional family pairing activates;
3. test light and dark modes;
4. confirm no role changes size, weight, line height, or wrapping between themes.

This is 20 combinations: 5 families × 2 typography presets × 2 appearance modes.

- [ ] **Step 3: Verify user overrides and scale extremes**

For each family category, choose a custom family and confirm it overrides both presets. Then test all six scales at 11px and 32px.

Expected:

- no visible text renders below 11px;
- compact rows remain navigable;
- dialogs remain within the viewport;
- entity rows ellipsize and expose full values;
- prose/status text wraps;
- technical values wrap anywhere unless the surface intentionally scrolls;
- code and diffs preserve formatting and scroll horizontally.

- [ ] **Step 4: Verify long-content and accessibility cases**

Exercise:

- a long workspace/session/file/model name;
- a long path, URL, model ID, and unbroken error string;
- loading, success, warning, and error states;
- keyboard navigation and focus restoration in menus/dialogs;
- 80%, 100%, 125%, 150%, and 200% Electron zoom.

Confirm status is not communicated by color alone and asynchronous feedback retains live-region semantics.

- [ ] **Step 5: Update the design guide with implementation status**

At the top of `docs/font-usage.md`, change Status to:

```markdown
- **Status:** Implemented typography design system; §5 preserves the pre-migration source audit for historical traceability
```

Add an “Implemented token contract” note linking the canonical files:

```markdown
### Implemented token contract

- Settings and validation: `src/shared/app-settings-keys.ts`
- Runtime projection: `src/renderer/components/SettingsApplier.tsx`
- Family, metric, role, and behavior tokens: `src/renderer/styles.css`
- User controls: `src/renderer/components/FontSettings.tsx`
- Regression contracts: `tests/unit/typography-*.test.ts`
```

Do not rewrite the pre-migration inventory as if it described the new source.

- [ ] **Step 6: Run final verification**

```bash
npm test
npm run typecheck
npm run lint
npm run package
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Run final GitNexus scope check and commit**

Run:

```text
detect_changes({ scope: "compare", base_ref: "main" })
```

Confirm the affected symbols and flows are limited to typography settings, theme application, renderer presentation, and their tests. Then:

```bash
git add docs/font-usage.md
git commit -m "docs: record implemented typography system"
```

---

## Completion criteria

The work is complete only when all of the following are true:

- Four family categories exist: Display, Interface, Content, and Monospace.
- The default system is Bricolage Grotesque / Inter / Inter / JetBrains Mono.
- Theme pairings are optional through **Follow color theme**, not coupled automatically to color choice.
- Six scales exist: Interface, Compact/navigation, Assistant, User, Composer, and Code/data.
- Persisted sizes are clamped to 11–32px; legacy `fontSize.sidebar` migrates to Compact/navigation.
- All nine semantic roles exist and are used throughout renderer surfaces.
- All code/data consumers resolve through `--font-mono` and `--font-size-code-block`.
- Display is used only for true View titles.
- No visible text uses 9px or 10px utilities.
- Entity rows truncate reliably; prose/status wraps; technical values wrap or scroll according to policy.
- Hover, active, disabled, loading, and selected states do not change font metrics.
- Unused font packages are removed only after source and package verification.
- Unit, integration, pi-integration, typecheck, lint, packaging, visual matrix, and GitNexus scope checks pass.
