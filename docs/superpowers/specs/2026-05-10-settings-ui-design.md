# Settings UI — Design Spec

**Date:** 2026-05-10
**Status:** Draft (pending user spec review)
**Builds on:** `2026-05-09-macpi-pi-dev-ui-design.md` §6 (Data model), §9 (Settings UI). Deviates from spec §6.4 by moving `cwd` from per-session to per-channel.

## 1. Summary

Add a global Settings UI with three categories (Theme, Font, Defaults) and a per-channel Settings dialog. Establishes the theme infrastructure (full light + dark + auto), font customisation (one family pair + per-region sizes), and a configurable default cwd that new channels inherit. Channel cwd becomes the source of truth for sessions created in that channel.

## 2. Goals

1. Single source of truth for global preferences (theme, font, default cwd) persisted across restarts.
2. Per-channel cwd configurable from a Channel Settings dialog (right-click and ⋮ menu).
3. Light + dark + auto theme that genuinely re-themes the UI (not just a stored value).
4. Per-region font sizing (sidebar, chat assistant, chat user, composer, code blocks) plus single UI font + monospace family.
5. NewSessionForm cwd input preserved as an "advanced per-session override" — pre-fills with channel cwd.

## 3. Non-goals

- Per-session settings overrides (spec §9 cascade) — out of scope this iteration.
- Channel-level settings other than name + cwd (no per-channel theme/font yet).
- About / version / pi-auth / keybinding / logging panels.
- Skill/extension/prompt management (spec §10) — separate plan.
- Pi `createAgentSession` integration of model / thinkingLevel / systemPrompt / allowedToolNames / noTools — these settings exist in the spec but we're scoping this iteration to user-facing UX (theme, font, cwd).
- Channel/session settings cascade resolution per spec §6.3 — only `defaultCwd` cascades (global → channel → session), and only for cwd. No multi-key cascade engine.

## 4. Architecture

No new architectural layers. All changes ride on existing IPC + repo + TanStack Query.

- **DB:** new migration `0004-channel_cwd.sql` adding `cwd TEXT` to `channels`. The existing-but-unused `settings_global` table (from `0001-init.sql`) finally gets a repo and IPC.
- **Main:** new `SettingsRepo`, new `dialog`/`settings` IPC methods, new `channel.setCwd` IPC, modified `session.create` to resolve cwd from channel/global rather than receiving it from the renderer (still accepts an optional override for the advanced flow).
- **Renderer:** new `SettingsDialog` shell + 3 category panels, `ChannelSettingsDialog`, `SettingsApplier` that writes `class="dark"` and CSS custom properties on `<html>`. `NewSessionForm` adjusted to pre-fill with channel cwd.
- **Theme infrastructure:** Tailwind switches to `darkMode: 'class'`; ~30 files swept to add `dark:` variants via 6 semantic component classes registered as `@layer components`.

## 5. Data model

### 5.1 Migration `0004-channel_cwd.sql`

```sql
ALTER TABLE channels ADD COLUMN cwd TEXT;
```

`channels.cwd` may be `NULL` → "inherit global default cwd" at session creation time. Existing rows get NULL via SQLite's default for new columns.

### 5.2 Settings keys (in `settings_global`)

Each row is `(key TEXT PRIMARY KEY, value TEXT NOT NULL)` where `value` is JSON-encoded. Initial keys:

| Key | Value type | Default |
|---|---|---|
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` |
| `fontFamily` | string | `"system-ui"` |
| `fontFamilyMono` | string | `"ui-monospace, SFMono-Regular, monospace"` |
| `fontSize.sidebar` | number (px) | `13` |
| `fontSize.chatAssistant` | number (px) | `14` |
| `fontSize.chatUser` | number (px) | `14` |
| `fontSize.composer` | number (px) | `14` |
| `fontSize.codeBlock` | number (px) | `13` |
| `defaultCwd` | string | `os.homedir()` |

Unset keys fall back to defaults. Settings repo is responsible for default merging.

### 5.3 Cwd resolution at session creation

```
session.create({channelId, cwd?})
   ↓ (in main, ChannelSessionsRepo + SettingsRepo + ChannelsRepo cooperate)
effectiveCwd = req.cwd                     // explicit per-session override
            ?? channel.cwd                  // channel default
            ?? settings_global.defaultCwd   // global default
            ?? os.homedir()                 // built-in fallback
```

The `channel_sessions.cwd` column (added in `0002`) snapshots this effective value at creation. Subsequently changing the channel cwd does NOT retroactively rewrite the session's cwd (preserves attach behaviour for old sessions).

## 6. IPC methods

### 6.1 New methods

```ts
"settings.getAll": {
	req: Record<string, never>;
	res: { settings: Record<string, unknown> };
};
"settings.set": {
	req: { key: string; value: unknown };
	res: Record<string, never>;
};
"channels.setCwd": {
	req: { id: string; cwd: string | null };
	res: Record<string, never>;
};
```

### 6.2 Modified methods

- `session.create` — `cwd` becomes optional; main resolves the effective cwd per §5.3.
  ```ts
  "session.create": {
      req: { channelId: string; cwd?: string };
      res: { piSessionId: string };
  };
  ```
- `settings.getDefaultCwd` — implementation now reads `settings_global.defaultCwd`, falling back to `os.homedir()`. Contract unchanged.

`settings.getAll` returns all settings keyed by string. The renderer is responsible for reading specific keys with type-narrowed accessors. We don't add per-key IPC methods because the dialog needs everything anyway and TanStack Query caches the whole result.

## 7. Components

### 7.1 New components

| File | Purpose |
|---|---|
| `SettingsDialog.tsx` | Reusable base modal: left categories panel + right edit panel. Generic `categories: SettingsCategory[]` prop. |
| `GlobalSettingsDialog.tsx` | Wraps `SettingsDialog`. Categories = Theme / Font / Defaults. |
| `ChannelSettingsDialog.tsx` | Smaller, single-pane modal. Fields: channel name, channel cwd (with 📁 picker, NULL = inherit global). |
| `ThemeSettings.tsx` | Radio group `light` / `dark` / `auto` with live preview. |
| `FontSettings.tsx` | UI family input + curated dropdown, monospace family input + curated dropdown, 5 size sliders. |
| `DefaultsSettings.tsx` | Default cwd text field + 📁 picker. |
| `SettingsApplier.tsx` | Mounts at App root. Reads `useSettings()`. Writes `class="dark"` (or removes) on `<html>`, plus CSS custom properties for fonts + sizes. Subscribes to `prefers-color-scheme` for `auto`. |

### 7.2 Modified components

| File | Change |
|---|---|
| `App.tsx` | Mount `<SettingsApplier />` at root. Manage `globalSettingsOpen` and `channelSettingsTarget` state. |
| `ModeRail.tsx` | Add gear icon at the bottom. Click → opens `<GlobalSettingsDialog />`. |
| `ChannelSidebar.tsx` | (a) Add "Settings…" entry to channel ⋮ menu (between Rename and Delete). (b) `onContextMenu` handler on each channel row → opens `<ChannelSettingsDialog />`. (c) Suppress browser's native context menu via `e.preventDefault()`. |
| `NewSessionForm.tsx` | Pre-fill `cwd` from the selected channel's cwd (via `useChannel(channelId)`) — falling back to global defaultCwd. Remains user-overridable. |
| `Composer.tsx`, `Timeline.tsx`, `ChannelSidebar.tsx`, `ChatPane.tsx`, `BreadcrumbBar.tsx`, `ConfirmDialog.tsx`, `BranchPanel.tsx`, `ModeRail.tsx`, `RowMenu.tsx`, `SessionRow.tsx`, `NewSessionForm.tsx`, banner components, message components | Replace hardcoded color classes with semantic component classes (see §9). |

## 8. Hooks

```ts
useSettings() : UseQueryResult<{ settings: Record<string, unknown> }>
useSetSetting() : UseMutationResult<{}, IpcError, { key: string; value: unknown }>
useChannelCwd(channelId) : UseQueryResult<{ cwd: string | null }>   // derived from useChannels.list, no extra IPC
useSetChannelCwd() : UseMutationResult<{}, IpcError, { id: string; cwd: string | null }>
```

`useSettings` has `staleTime: Number.POSITIVE_INFINITY` and is invalidated by `useSetSetting`'s `onSuccess`.

The renderer also gets a typed accessor module:

```ts
// src/renderer/utils/settings-keys.ts

export const SETTINGS_DEFAULTS = {
	theme: "auto" as const,
	fontFamily: "system-ui",
	fontFamilyMono: "ui-monospace, SFMono-Regular, monospace",
	"fontSize.sidebar": 13,
	"fontSize.chatAssistant": 14,
	"fontSize.chatUser": 14,
	"fontSize.composer": 14,
	"fontSize.codeBlock": 13,
	defaultCwd: "",
};

export type ThemeMode = "light" | "dark" | "auto";

export function getTheme(settings: Record<string, unknown>): ThemeMode { ... }
export function getFontFamily(settings: Record<string, unknown>): string { ... }
// etc.
```

## 9. Theme infrastructure

### 9.1 Tailwind configuration change

Switch `tailwind.config.js` `darkMode` to `"class"`. Add a small `@layer components` block in `src/renderer/styles.css`:

```css
@layer components {
	.surface-app    { @apply bg-white dark:bg-[#1a1a1f]; }
	.surface-panel  { @apply bg-zinc-100 dark:bg-zinc-800; }
	.surface-row    { @apply bg-zinc-200 dark:bg-zinc-700; }
	.text-primary   { @apply text-zinc-900 dark:text-zinc-100; }
	.text-muted     { @apply text-zinc-500 dark:text-zinc-400; }
	.border-divider { @apply border-zinc-200 dark:border-zinc-800; }
}
```

### 9.2 Sweep targets

Map of frequent inline classes → semantic class:

| Inline | Replace with |
|---|---|
| `bg-[#1a1a1f]`, `bg-zinc-900` | `surface-app` |
| `bg-[#26262b]`, `bg-zinc-800` | `surface-panel` |
| `bg-zinc-700` (selected row, button, etc.) | `surface-row` (or context-specific) |
| `text-zinc-200`, `text-zinc-300` | `text-primary` |
| `text-zinc-500`, `text-zinc-400` | `text-muted` |
| `border-zinc-800` | `border-divider` |

Specific accent classes (red-300, indigo-500, amber-*, etc.) for buttons / banners stay as-is or get pair-mapped when their light-mode read is poor. Rule of thumb: if a colour is part of brand/affordance signalling (destructive red, queue indigo, retry amber), keep it. Only neutral grays get re-themed.

### 9.3 Theme application

`SettingsApplier` runs on every settings change:

```ts
function applyTheme(mode: ThemeMode) {
	const root = document.documentElement;
	const effective =
		mode === "auto"
			? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
			: mode;
	root.classList.toggle("dark", effective === "dark");
}
```

For `auto`, it also subscribes to `prefers-color-scheme` change events.

### 9.4 Font application

```ts
function applyFonts(settings: Record<string, unknown>) {
	const root = document.documentElement;
	root.style.setProperty("--font-family", String(settings.fontFamily ?? "system-ui"));
	root.style.setProperty("--font-family-mono", String(settings.fontFamilyMono ?? "ui-monospace, SFMono-Regular, monospace"));
	root.style.setProperty("--font-size-sidebar", `${Number(settings["fontSize.sidebar"] ?? 13)}px`);
	// ... 4 more
}
```

Components use Tailwind arbitrary values:

```tsx
<div className="text-[length:var(--font-size-sidebar)] font-[var(--font-family)]">...</div>
```

## 10. Curated font lists

UI family dropdown options (free text input is also accepted):

```
system-ui, -apple-system, sans-serif         (default)
"Inter", system-ui, sans-serif
"SF Pro Display", system-ui, sans-serif
"Helvetica Neue", Helvetica, sans-serif
Georgia, "Times New Roman", serif
```

Monospace dropdown:

```
ui-monospace, SFMono-Regular, monospace      (default)
"JetBrains Mono", ui-monospace, monospace
"Fira Code", ui-monospace, monospace
"Cascadia Code", ui-monospace, monospace
"Menlo", ui-monospace, monospace
```

If the user picks an option not installed on their system, the OS font fallback chain (e.g. `system-ui` at the end) keeps things readable.

## 11. Channel settings dialog

Opens via two paths (both already exist for rename/delete):

1. **Right-click on a channel row** in the sidebar — `onContextMenu={(e) => { e.preventDefault(); openChannelSettings(c.id); }}`.
2. **⋮ menu → "Settings…"** — appended between Rename and Delete entries.

Dialog content:

- Channel name (text input — same as inline rename, but in a more obvious place)
- Channel cwd (text input + 📁 picker; placeholder `"inherit global (<resolved-default>)"`)
- "Save" button — saves both name and cwd. Empty cwd writes `NULL` (inherit global).
- "Cancel" button.

## 12. Error handling

| Scenario | Behaviour |
|---|---|
| `settings.set` with unknown key | Accept and store anyway — defends against future-spec keys. Renderer's typed accessors handle missing/extra keys gracefully. |
| `settings.set` with invalid value type | Server-side just JSON-stringifies whatever it gets. Client-side validation lives in the dialog (e.g. font size slider clamps to `[8, 32]`). |
| Channel cwd points to a path that no longer exists | Acceptable — pi will surface a tool error when needed. We don't pre-validate filesystem state. |
| Theme=`auto` but no `matchMedia` (test env) | `SettingsApplier` falls back to dark. |
| Settings load fails (DB error) | Apply defaults; show a non-blocking toast in `App.tsx`. (Toast component not yet built; for v1 just `console.error` and proceed with defaults.) |

## 13. Testing

### L1 unit
- `tests/unit/settings-keys.test.ts` — typed accessors return defaults when keys missing, parse correctly when present.
- `tests/unit/cwd-resolver.test.ts` — `resolveCwd({reqCwd, channelCwd, defaultCwd})` priority order. Pure function.

### L2 integration
- `tests/integration/settings-repo.test.ts` (new) — get/set/getAll round-trips; JSON encoding/decoding.
- `tests/integration/channels-repo.test.ts` *(extend)* — channel cwd column round-trip via `setCwd` / `getById`.
- `tests/integration/ipc-router.test.ts` *(extend)* — 3 new methods (happy + at least one error each); session.create resolves cwd from channel.

### L3
- Skip — settings don't touch pi.

### Manual smoke
1. Launch app → defaults applied (auto theme follows OS, default fonts, homedir cwd).
2. Open Global Settings (mode rail gear) → switch theme to light → all panels re-theme live.
3. Change UI font to `"Inter"` and sidebar size to 16 → sidebar updates immediately.
4. Set Default cwd to `~/code` → close → create a new channel → ⋮ → Settings — channel cwd field empty (inherits) — placeholder shows `~/code`.
5. Set channel cwd to `~/code/macpi`. Save. Create new session in that channel — breadcrumb shows `~/code/macpi`. Restart → setting persists.
6. Right-click another channel → settings dialog opens (no native browser menu).
7. Open NewSessionForm — cwd input pre-filled with channel's cwd, override-able.

## 14. File structure

```
src/main/
  db/migrations/0004-channel_cwd.sql                     [NEW]
  repos/channels.ts                                      [MODIFY: +setCwd, getById returns cwd]
  repos/settings.ts                                      [NEW: get, set, getAll]
  ipc-router.ts                                          [MODIFY: +3 methods, session.create resolves cwd]
  default-cwd.ts                                         [MODIFY: read from SettingsRepo, fallback to homedir]
  index.ts                                               [MODIFY: instantiate SettingsRepo, pass to router and default-cwd]

src/shared/
  ipc-types.ts                                           [MODIFY: +3 method types, session.create cwd optional]

src/renderer/
  components/SettingsDialog.tsx                          [NEW]
  components/GlobalSettingsDialog.tsx                    [NEW]
  components/ChannelSettingsDialog.tsx                   [NEW]
  components/ThemeSettings.tsx                           [NEW]
  components/FontSettings.tsx                            [NEW]
  components/DefaultsSettings.tsx                        [NEW]
  components/SettingsApplier.tsx                         [NEW]
  components/ModeRail.tsx                                [MODIFY: gear icon at bottom]
  components/ChannelSidebar.tsx                          [MODIFY: contextmenu + ⋮ Settings entry]
  components/NewSessionForm.tsx                          [MODIFY: pre-fill from channel cwd]
  App.tsx                                                [MODIFY: SettingsApplier root + dialog state]
  components/[~17 files]                                 [MODIFY: swap hardcoded colors for surface-* classes]
  queries.ts                                             [MODIFY: +useSettings, useSetSetting, useSetChannelCwd]
  utils/settings-keys.ts                                 [NEW: typed accessors + defaults]
  utils/cwd-resolver.ts                                  [NEW: pure resolveCwd]
  styles.css                                             [MODIFY: @layer components block]

tailwind.config.js                                       [MODIFY: darkMode: "class"]

tests/
  unit/settings-keys.test.ts                             [NEW]
  unit/cwd-resolver.test.ts                              [NEW]
  integration/settings-repo.test.ts                      [NEW]
  integration/channels-repo.test.ts                      [+ cwd round-trip]
  integration/ipc-router.test.ts                         [+ ~6 new test cases]
```

## 15. Decision log

- **D1.** cwd moves from per-session (spec §6.4) to per-channel. Reason: user-driven. Channel cwd resolves to session.cwd at creation; session.cwd snapshot stays for stable history attach.
- **D2.** `settings_global` schema is reused as-is from `0001-init.sql`. New keys added by writing rows; no schema change required for adding more keys later.
- **D3.** No per-key IPC methods. `settings.getAll` is the read API. Reason: dialog needs everything anyway; one query is faster than 9.
- **D4.** Theme uses Tailwind `darkMode: 'class'` + 6 semantic component classes, NOT CSS-in-JS or a theme provider context. Reason: minimal infra, leverages Tailwind's existing dark variants, sweepable in one pass.
- **D5.** Font sizing via CSS custom properties (NOT Tailwind config), accessed via `text-[length:var(--font-size-...)]`. Reason: live updates without recompiling Tailwind; per-region granularity without 5 Tailwind tokens.
- **D6.** Channel Settings dialog replaces inline rename for channels: the `Rename` ⋮ entry stays, but the dialog is the canonical place to change cwd. Right-click is the discoverable shortcut.
- **D7.** NewSessionForm keeps its cwd input as an "advanced override" pre-filled from channel cwd. Reason: user requested. Empty input falls back to channel cwd resolution.

## 16. Open items / future work

- Per-channel and per-session cascade for non-cwd settings (theme/font overrides per channel) — defer to a future iteration if requested.
- Channel-level pi settings (model, thinkingLevel, allowedToolNames) — depend on pi integration that isn't built yet; defer.
- Skill/extension/prompt management UI — separate plan (spec §10).
- Settings export/import (JSON) — defer.
- About dialog (version, license, links) — defer.
