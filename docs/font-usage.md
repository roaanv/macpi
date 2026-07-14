# MacPi font usage audit and recommended typography system

- **Status:** Source audit and design recommendation
- **Scope:** All user-facing renderer text, including persistent surfaces, settings, dialogs, menus, transient feedback, Markdown, editors, code, and data
- **Audit basis:** Static inspection of `src/renderer`, Tailwind defaults, runtime font settings, and theme tokens
- **Date:** 2026-07-13

## 1. Executive summary

MacPi’s typography feels inconsistent primarily because it does not currently have a semantic typography system. Components combine four different mechanisms:

1. theme font-family variables;
2. user font-family overrides;
3. five configurable regional font sizes; and
4. component-local Tailwind utilities and arbitrary pixel sizes.

The application currently uses at least nine explicit sizes—9, 10, 11, 12, 13, 14, 16, 18, and 20px—plus inherited 16px text, relative Markdown headings, a 90% sidebar calculation, and CodeMirror defaults. Similar UI elements often use different treatments. For example, group headings appear at both 10px and 12px; empty states appear at 12, 14, or inherited 16px; and visually identical code-like content can use three different monospace resolution paths.

The most important findings are:

- **The display fonts are configured but unused.** Every theme defines `--font-display`, and `.font-display` exists, but no renderer component uses it.
- **Monospace selection is inconsistent.** Tool blocks reference `--font-family-mono` without a fallback; CodeMirror adds only a generic `monospace` fallback; Markdown and plain file previews use `--font-mono`; some textareas use Tailwind’s unrelated `font-mono` stack. Under default Slate with no user override, this makes tools inherit the UI face, CodeMirror use generic monospace, and Markdown/previews use JetBrains Mono.
- **The custom UI family is bypassed in places.** The note editor forces `--font-body` rather than using the effective user-selected family.
- **Only five areas have configurable sizes.** Most navigation, settings, dialogs, menus, statuses, editors, and metadata remain fixed.
- **Microcopy is over-fragmented.** The app contains 9, 10, 11, and 12px treatments with inconsistent weights, tracking, and line heights.
- **Hierarchy is inconsistent.** Settings headings range from 14 to 20px, while some screen states use the inherited 16px baseline without an explicit semantic role.
- **Wrapping and truncation are inconsistent.** Some labels have robust ellipsis behavior; others can wrap or overflow despite occupying equivalent UI roles.
- **Four bundled families appear unused:** Fraunces, Plus Jakarta Sans, Gloock, and Manrope.

### Recommendation

Adopt four configurable family categories—**Display, Interface, Content, and Monospace**—mapped to nine semantic treatment roles. Use only three visible families by default:

- Display: **Bricolage Grotesque Variable**
- Interface: **Inter Variable**
- Content: **Inter Variable**
- Monospace: **JetBrains Mono Variable**

Keep theme-specific font pairings as optional personality presets, but make semantic roles and metrics consistent across themes.

## 2. Audit method and terminology

This document records the effective source-level typography rather than judging it from screenshots. `ProviderAuthList.tsx` and `ModelPicker.tsx` contain styled text but are not imported or mounted anywhere in the renderer, so they are excluded from the current user-facing inventory. `SettingsApplier.tsx` controls typography but renders no visible text.

For each area, the audit considers:

- family and fallback stack;
- size and line height;
- weight and style;
- letter spacing and text transform;
- color or opacity role;
- wrapping, whitespace, and truncation;
- interactive or semantic states; and
- the component or selector that supplies the treatment.

### 2.1 Metric shorthand

Tailwind uses its default scale because `tailwind.config.cjs` does not customize typography:

| Utility | Effective size / line height |
|---|---:|
| `text-xs` | 12px / 16px |
| `text-sm` | 14px / 20px |
| `text-base` | 16px / 24px |
| `text-lg` | 18px / 28px |
| `text-xl` | 20px / 28px |
| `leading-relaxed` | 1.625 |
| `leading-snug` | 1.375 |
| `tracking-wide` | 0.025em |
| `tracking-wider` | 0.05em |
| `tracking-widest` | 0.1em |
| `font-medium` | 500 |
| `font-semibold` | 600 |

Tailwind preflight establishes a 16px/24px root baseline through `html { line-height: 1.5 }` and body inheritance. Arbitrary sizes such as `text-[10px]` set the size but do not establish a paired line height, so they depend on the inherited line-height context.

### 2.2 Family shorthand

- **Effective UI family:** `var(--font-family, var(--font-body))`; a user override wins, otherwise the active theme body family is used.
- **Tool mono variable:** `var(--font-family-mono)` with no fallback; used by tool blocks. If the variable is absent, the declaration is invalid and the tool block inherits the surrounding UI family.
- **CodeMirror mono override:** `var(--font-family-mono, monospace)`; uses the user/theme alias when present and otherwise falls back only to generic `monospace`.
- **Theme mono:** `var(--font-mono)`; used by Markdown code and plain file preview, but ignores the user mono override.
- **Theme body:** `var(--font-body)`; used explicitly by the note editor, bypassing the user UI override.
- **Tailwind mono:** Tailwind’s default `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`; this bypasses both MacPi mono variables.

### 2.3 Color shorthand

MacPi already has useful semantic color tokens:

- **primary:** `--text-primary`
- **muted:** `--text-muted`
- **faint:** `--text-faint`
- **accent:** `--accent`
- **success:** `--ok`
- **warning:** `--warn`
- **error:** `--err`

These colors vary by theme and light/dark mode. The typography recommendation preserves these semantics.

## 3. Current font sources and global configuration

### 3.1 Bundled font assets

`src/renderer/styles.css:1-21` imports fourteen font packages:

| Family | Current purpose | Usage status |
|---|---|---|
| Inter Variable | Slate display and body | Used as body; display role unused |
| JetBrains Mono Variable | Slate/Ember mono | Used |
| Space Grotesk Variable | Carbon display and body | Used as body; display role unused |
| IBM Plex Mono | Carbon/Punch mono | Used |
| Instrument Serif | Ember display | Token exists, but display role is unused |
| Hanken Grotesk Variable | Ember body | Used |
| Bricolage Grotesque Variable | Marine display | Token exists, but display role is unused |
| Spline Sans Variable | Marine body | Used |
| Spline Sans Mono Variable | Marine mono | Used |
| Familjen Grotesk Variable | Punch display and body | Used as body; display role unused |
| Fraunces Variable | None found | Apparently unused |
| Plus Jakarta Sans | None found | Apparently unused |
| Gloock | None found | Apparently unused |
| Manrope Variable | None found | Apparently unused |

### 3.2 Current theme pairings

Defined in `src/renderer/styles.css:37-245`:

| Theme | Display token | Body token | Mono token |
|---|---|---|---|
| Slate | Inter Variable | Inter Variable | JetBrains Mono Variable |
| Carbon | Space Grotesk Variable | Space Grotesk Variable | IBM Plex Mono |
| Ember | Instrument Serif | Hanken Grotesk Variable | JetBrains Mono Variable |
| Marine | Bricolage Grotesque Variable | Spline Sans Variable | Spline Sans Mono Variable |
| Punch | Familjen Grotesk Variable | Familjen Grotesk Variable | IBM Plex Mono |

The UI advertises these pairings in `ThemeSettings.tsx`, but the display member is not actually applied to headings. Ember therefore advertises an editorial serif pairing while rendering headings in Hanken Grotesk.

### 3.3 Global inheritance

`src/renderer/styles.css:286-295` gives `body` the effective UI family, app foreground/background, and OpenType features `ss01`, `ss02`, and `cv11`.

`src/renderer/App.tsx:30` also applies `font-[family-name:var(--font-family)]`. When `--font-family` is absent, that declaration is invalid and the app inherits the body family. This duplicate path is unnecessary and makes the source of truth less obvious.

The global layer does not define a semantic size, line height, weight, tracking, transform, or wrapping policy. Tailwind preflight and component utilities provide those values.

### 3.4 Current user configuration

`src/shared/app-settings-keys.ts` and `FontSettings.tsx` expose:

| Setting | Default |
|---|---:|
| UI family | Theme default |
| Monospace family | Intended theme default; actual fallback varies by consumer |
| Sidebar size | 13px |
| Assistant chat size | 14px |
| User chat size | 14px |
| Composer size | 14px |
| Code-block size | 13px |

The font-size UI allows 8–32px, but the persisted accessor accepts any finite number. Values written outside the slider are not clamped.

The labels “Default (Inter)” and “Default (JetBrains Mono)” should say “Theme default” because theme families differ. The mono label is also misleading under default Slate: with no override, Markdown and file preview use JetBrains Mono, CodeMirror falls back to generic monospace, and tool blocks inherit the UI family. Carbon, Ember, Marine, and Punch happen to define `--font-family-mono`, so tools and CodeMirror follow those theme mono choices.

## 4. Recommended semantic typography system

### 4.1 Configurable family categories

| Category | Recommended default | Used for |
|---|---|---|
| **Display** | Bricolage Grotesque Variable | Major view and panel identity only |
| **Interface** | Inter Variable | Navigation, controls, labels, metadata, status UI |
| **Content** | Inter Variable | Assistant/user messages, notes, explanations, long-form content |
| **Monospace** | JetBrains Mono Variable | Code, logs, paths, IDs, JSON, diagnostics, structured data |

Interface and Content intentionally share Inter by default. They remain separate tokens so users can change reading content without changing dense interface text.

Recommended effective token resolution:

```css
--font-display-effective: var(--font-family-display, var(--font-display));
--font-interface-effective: var(--font-family-interface, var(--font-body));
--font-content-effective: var(--font-family-content, var(--font-interface-effective));
--font-mono-effective: var(--font-family-mono, var(--font-mono));
```

### 4.2 Treatment roles

| Role | Family | Size / line height | Weight | Tracking / transform | Default color | Behavior |
|---|---|---:|---:|---|---|---|
| **View title** | Display | 20 / 28px | 650 | normal | primary | Wrap only when space is genuinely narrow |
| **Section heading** | Interface | 16 / 24px | 600 | normal | primary | Natural wrap |
| **Body / prose** | Content | 14 / 22px | 400 | normal | primary | Natural wrap; Markdown rhythm allowed |
| **Control** | Interface | 13 / 18px | 500 | normal | primary or muted | One line unless control is explicitly multiline |
| **Label** | Interface | 13 / 18px | 500 | normal | primary | Natural wrap for forms; ellipsis for rows |
| **Metadata** | Interface | 12 / 16px | 400 | normal | muted | Context-specific wrap or ellipsis; tabular numeric variant |
| **Overline** | Interface | 11 / 16px | 600 | 0.08em uppercase | faint | One line; no values below 11px |
| **Status / feedback** | Interface | 13 / 18px | 400 | normal | semantic | Natural wrap; optional 600 status label |
| **Code / data** | Monospace | 13 / 20px | 400 | normal | primary | Preserve/scroll for code; wrap-anywhere for IDs and errors |

### 4.3 Theme policy

The semantic roles and metrics above should remain constant across themes. Themes may optionally change family tokens:

| Optional preset | Display | Interface / Content | Mono |
|---|---|---|---|
| Default | Bricolage Grotesque | Inter | JetBrains Mono |
| Slate personality | Inter | Inter | JetBrains Mono |
| Carbon personality | Space Grotesk | Space Grotesk | IBM Plex Mono |
| Ember personality | Instrument Serif | Hanken Grotesk | JetBrains Mono |
| Marine personality | Bricolage Grotesque | Spline Sans | Spline Sans Mono |
| Punch personality | Familjen Grotesk | Familjen Grotesk | IBM Plex Mono |

User family overrides should take precedence over optional theme pairings.

## 5. Comprehensive area inventory

The **Target role** column describes the recommended category after consolidation. It does not claim the app already implements that role.

### 5.1 App shell, navigation, and hierarchy

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| App shell default | Effective UI family; inherited 16/24px unless a child overrides it | Primary app foreground | Body/prose for copy; explicit roles for all structural text | `styles.css:286-299`, `App.tsx:27-31`, Tailwind preflight |
| Mode rail | No visible labels; gear emoji is explicitly 16/16px through `text-base leading-none` | Icon color muted → primary; accessible labels/tooltips carry names | Control for any future visible labels | `ModeRail.tsx:42-49,70-141` |
| Workspace section overline | Effective UI; 10px; 600; uppercase; 0.1em | Faint; single line | Overline | `WorkspaceSidebar.tsx` |
| New-workspace “+” control | Inherits sidebar context but sets 12px | Muted → primary on hover | Control | `WorkspaceSidebar.tsx` |
| Workspace rows | Effective UI; configurable sidebar size, default 13px; 400 | Muted or primary; names can wrap/overflow because no robust truncation | Label | `WorkspaceSidebar.tsx` |
| Workspace rename input | Effective UI; inherited sidebar size | Primary; no explicit line-height | Control | `WorkspaceSidebar.tsx` |
| Sessions overline | Effective UI; 10px; 600; uppercase; 0.1em | Faint | Overline | `WorkspaceSidebar.tsx` |
| Session count | Effective UI; 10px; 500; normal case/tracking | Faint | Metadata | `WorkspaceSidebar.tsx` |
| Session tree rows | Effective UI; 90% of configured sidebar size, default 11.7px | Muted/primary; single-line ellipsis; full value in title | Label | `WorkspaceSidebar.tsx`, `SessionRow.tsx` |
| Session rename input | Effective UI; inherits calculated 90% size | Primary | Control | `SessionRow.tsx` |
| Upper chat breadcrumb | Effective UI; 12/16px; 400 | Muted/faint/primary segments; no explicit truncation | Metadata | `ChatBreadcrumb.tsx` |
| Detailed breadcrumb | Effective UI; 12/16px; 400 | Muted/primary/faint; nowrap; cwd ellipsis may be fragile in flex layout | Metadata | `BreadcrumbBar.tsx` |

### 5.2 Chat, messages, and composer

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| No-session state | Effective UI; inherited 16/24px | Centered muted text | Status/feedback | `ChatPane.tsx:133-140` |
| Loading-session state | Effective UI; inherited 16/24px | Centered muted text | Status/feedback | `ChatPane.tsx:113-119` |
| Attach-error summary | Effective UI; inherited 16/24px | Centered muted; inline `<code>` is not explicitly mono | Status/feedback + Code/data | `ChatPane.tsx:121-131` |
| Attach-error detail | Effective UI; 12/16px | Error color | Status/feedback | `ChatPane.tsx` |
| Assistant message body | Effective UI; configurable 14px default; line-height 1.625 | Markdown wraps naturally | Body/prose | `AssistantMessage.tsx`, `MarkdownText.tsx` |
| Assistant identity/meta row | Effective UI; 10px; inherited line height | “pi” warning, separator muted; branch action muted | Metadata | `AssistantMessage.tsx` |
| Assistant thinking text | Effective UI; 12/16px; italic | Muted; whitespace preserved and wrapped | Metadata or Status/feedback | `AssistantMessage.tsx` |
| User message body | Effective UI; configurable 14px default; line-height 1.625 | Accent bubble; max width 75%; Markdown wraps | Body/prose | `UserMessage.tsx`, `MarkdownText.tsx` |
| User branch action/error | Effective UI; 10px | Hidden until hover; faint → primary; error semantic | Metadata | `MessageBranchButton.tsx` |
| Markdown paragraphs/lists | Inherit message or preview context; message default 14px/1.625 | 0.5em block rhythm; natural wrap | Body/prose | `styles.css`, `MarkdownText.tsx` |
| Markdown h1 | Content context; 1.4em; 600 | 0.75em top margin | Section heading within prose | `styles.css` |
| Markdown h2 | Content context; 1.25em; 600 | 0.75em top margin | Section heading within prose | `styles.css` |
| Markdown h3 | Content context; 1.1em; 600 | 0.75em top margin | Label/heading within prose | `styles.css` |
| Markdown h4–h6 | Content context; inherited 1em; 600 | Same top margin despite equivalent size | Label within prose; consider reducing levels | `styles.css` |
| Markdown emphasis | Inherited body; strong 600; em italic | Context color | Body/prose variants | `styles.css` |
| Markdown blockquote | Inherited body | Muted with divider; user bubble inherits at 85% opacity | Body/prose | `styles.css` |
| Markdown links | Inherited body | Accent, dotted underline; solid on hover; bubble uses contrast foreground | Body/prose link variant | `MarkdownText.tsx`, `styles.css` |
| Inline Markdown code | Theme mono; configurable code size, default 13px | Row background; no explicit code line height | Code/data | `MarkdownText.tsx`, `styles.css` |
| Fenced Markdown code | Theme mono; configurable code size, default 13px | Preserves formatting; horizontal scroll | Code/data | `MarkdownText.tsx` |
| Markdown table text | Inherits content context; headers 600 | Table scrolls horizontally | Body/prose; Code/data only for code cells | `styles.css` |
| Tool summary row | `var(--font-family-mono)` without fallback; configurable 13px default. Under default Slate with no override, the invalid family declaration inherits the UI face | Primary/muted; summary ellipsis; state border | Code/data | `ToolBlock.tsx:51-93` |
| Tool state/eyebrow | Same tool family behavior; 9px; uppercase; 0.1em | Muted or semantic | Overline, with minimum 11px | `ToolBlock.tsx:138-176` |
| Tool expanded output | Same tool family behavior; configurable 13px default | Pre-wrap; semantic error option; long unbroken tokens can overflow | Code/data | `ToolBlock.tsx:73-93` |
| Unified diff | Same tool family behavior; configurable 13px default; line-height 1.625 | Horizontal scroll; semantic line colors | Code/data | `ToolBlock.tsx:138-176` |
| Composer input | Effective UI; configurable 14px default; inherited/default line height | Primary; faint placeholder; wraps | Body/prose input variant | `Composer.tsx` |
| Composer action buttons | Effective UI; fixed 14/20px; 400 | Warning/accent; disabled opacity 50% | Control | `Composer.tsx` |
| Slash popup empty state | Effective UI; 12/16px | Muted | Status/feedback | `SlashPopup.tsx` |
| Slash command name | Effective UI; 12/16px; 600 | Primary | Control | `SlashPopup.tsx` |
| Slash hint/description | Effective UI; 12/16px | Muted; description ellipsis may be fragile | Metadata | `SlashPopup.tsx` |
| Chat footer | Effective UI; 11px; inherited line height | Muted; thinking/context values 500; semantic state colors | Metadata | `ChatFooter.tsx` |
| Context usage segments | Effective UI; 9px; 500; leading-none; tabular | Clipped/nowrap; status colors | Metadata, minimum 11px | `ChatContextBar.tsx` |
| Context summary | Effective UI; 10px; 400/500; tabular | Faint; cwd/label ellipsis; wraps between segments | Metadata, minimum 11px | `ChatContextBar.tsx` |

### 5.3 Banners, queue, and chat feedback

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Retry banner | Effective UI; 12/16px | Warning tone; wraps | Status/feedback | `banners/RetryBanner.tsx` |
| Compaction banner | Effective UI; 12/16px | Muted/warning context; wraps | Status/feedback | `banners/CompactionBanner.tsx` |
| Skills-changed banner | Effective UI; 12/16px | Status semantics; includes action | Status/feedback + Control | `banners/SkillsChangedBanner.tsx` |
| Error banner label | Effective UI; 10px; 600; uppercase; 0.025em | Error semantic | Overline | `banners/ErrorBanner.tsx` |
| Error banner body | Effective UI; 14/20px | Error semantic; pre-wrap | Status/feedback | `banners/ErrorBanner.tsx` |
| Error banner action | Effective UI; 12/16px | Interactive semantic action | Control | `banners/ErrorBanner.tsx` |
| Queue summary strip | Effective UI; 11px | Wraps; content is truncated in code | Status/feedback | `banners/QueuePills.tsx` |
| Queue clear action | Effective UI; 10px | Interactive | Control, minimum 11–13px | `banners/QueuePills.tsx` |
| Queue remove glyph | Effective UI; 14px; leading-none | Interactive | Control | `banners/QueuePills.tsx` |

### 5.4 File browser, previews, and editors

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| File browser empty state | Effective UI; 14/20px | Centered muted | Status/feedback | `FileBrowserPane.tsx` |
| File browser header/path | Effective UI; 12/16px | Muted; cwd ellipsis and tooltip | Metadata | `FileBrowserPane.tsx` |
| File browser controls | Effective UI; 12/16px | Muted; hover surfaces | Control | `FileBrowserPane.tsx` |
| File tree loading/error/empty | Effective UI; 12/16px | Muted/error | Status/feedback | `FileTree.tsx` |
| Folder/file rows | Effective UI; 12/16px | Selection surface; disabled opacity; names lack explicit truncation/nowrap | Label | `FileTree.tsx` |
| Preview empty/loading/error/binary | Effective UI; 14/20px | Muted/error | Status/feedback | `FilePreview.tsx` |
| Markdown file preview | Effective UI inherited at 16/24px, then Markdown rules | Larger than chat Markdown | Body/prose | `FilePreview.tsx:56-63`, `styles.css:334-417` |
| Plain-text file preview | Theme mono; 12/16px through `text-xs` | Preserved formatting; both-axis scrolling | Code/data | `FilePreview.tsx:66-72` |
| CodeMirror resource editors | `var(--font-family-mono, monospace)`; inherited 16px size; CodeMirror scroller line-height 1.4 (22.4px at that size) | Under default Slate with no override, uses generic monospace; editor-managed scrolling; always configured as dark | Code/data | `CodeEditor.tsx:36-52`, CodeMirror base theme |
| Models JSON textarea | Tailwind mono; 12/16px | Multiline; no unified code token | Code/data | `ModelsJsonEditor.tsx` |

### 5.5 Notes, prompts, skills, extensions, and diagnostics

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Notes list overline | Effective UI; 12/16px; 600; uppercase; 0.025em | Muted | Overline | `NotesList.tsx` |
| Note row title | Effective UI; 14/20px; 500 | Primary/muted; ellipsis | Label | `NotesList.tsx` |
| Note excerpt | Effective UI; 12/16px | Faint; ellipsis | Metadata | `NotesList.tsx` |
| Note list controls/status | Effective UI; 12/16px | Muted or semantic; delete appears on hover | Control / Status | `NotesList.tsx` |
| Note editor state text | Effective UI; 14/20px | Muted/error/warning | Status/feedback | `NoteEditor.tsx` |
| Note editor content | Theme body, not effective UI; 14px; line-height 1.625 | Natural wrap; default placeholder styling | Body/prose | `NoteEditor.tsx` |
| Prompt/skill/extension list overlines | Effective UI; 12/16px; 600; uppercase; 0.025em | Muted | Overline | `PromptsList.tsx`, `SkillsList.tsx`, `ExtensionsList.tsx` |
| Resource list names | Effective UI; 14/20px; usually 500 or 600 | Primary/muted; ellipsis | Label | `PromptsList.tsx:55-102`, `SkillsList.tsx:52-90`, `ExtensionsList.tsx:52-96` |
| Resource source/argument microcopy | Effective UI; 10px | Faint; often ellipsis | Metadata, minimum 11–12px | `PromptsList.tsx:55-102`, `SkillsList.tsx:52-90`, `ExtensionsList.tsx:52-96` |
| Resource descriptions | Effective UI; 12/16px | Muted; ellipsis | Metadata | `PromptsList.tsx:55-102`, `SkillsList.tsx:52-90`, `ExtensionsList.tsx:52-96` |
| Resource detail title | Effective UI; 14/20px; 600 | Primary | Section heading or Label, depending on panel hierarchy | `PromptDetail.tsx:37-116`, `SkillDetail.tsx:31-77`, `ExtensionDetail.tsx:44-121` |
| Resource detail labels/source | Effective UI; 12/16px | Muted | Metadata / Label | `PromptDetail.tsx:37-116`, `SkillDetail.tsx:31-77`, `ExtensionDetail.tsx:44-121` |
| Resource detail actions/status | Effective UI; 12/16px | Interactive; warning/error as needed | Control / Status | `PromptDetail.tsx:37-116`, `SkillDetail.tsx:31-77`, `ExtensionDetail.tsx:44-121` |
| Diagnostics panel base | Effective UI; 12/16px | Severity color | Status/feedback | `DiagnosticsPanel.tsx` |
| Diagnostics title | Effective UI; 12/16px; 600 | Counts use semantic colors | Section heading or Label | `DiagnosticsPanel.tsx` |
| Diagnostics timestamp/rule | Tailwind mono or effective UI; 10px | Muted; long tokens can crowd | Code/data / Metadata, minimum 11px | `DiagnosticsPanel.tsx` |
| Diagnostics message | Effective UI; 12/16px | Semantic; natural wrap | Status/feedback | `DiagnosticsPanel.tsx` |

### 5.6 Settings shell and appearance settings

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Settings sidebar title | Effective UI; 14/20px; 600 | Primary | Section heading or Label | `SettingsDialog.tsx` |
| Settings group overline | Effective UI; 10px; 600; uppercase; 0.1em | Faint | Overline | `SettingsDialog.tsx` |
| Settings navigation item | Effective UI; 13px; inherited line height | Muted → primary; active surface | Control | `SettingsDialog.tsx` |
| Settings content header | Effective UI; 16/24px; 600 | Primary | Section heading | `SettingsDialog.tsx` |
| Settings Close action | Effective UI; 12/16px | Muted → primary | Control | `SettingsDialog.tsx` |
| Font panel title | Effective UI; 16/24px; 600 | Primary | Section heading | `FontSettings.tsx` |
| Font family labels | Effective UI; 14/20px; 500 | Primary | Label | `FontSettings.tsx` |
| Font selects/inputs | Effective UI; 14/20px | Native clipping; custom value can be long | Control | `FontSettings.tsx` |
| Font size subsection | Effective UI; 14/20px; 500 | Primary | Label | `FontSettings.tsx` |
| Font size rows | Effective UI; 14/20px | Muted labels; tabular numeric values | Label + Metadata | `FontSettings.tsx` |
| Theme panel headings | Effective UI; 14/20px; 600 | Primary | Label or Section heading | `ThemeSettings.tsx` |
| Theme panel descriptions | Effective UI; 12/16px | Muted | Metadata | `ThemeSettings.tsx` |
| Theme card name | Effective UI; 14/20px; 600 | Primary | Label | `ThemeSettings.tsx` |
| Theme card active badge | Effective UI; 10px; 600; uppercase; 0.05em | Accent | Overline | `ThemeSettings.tsx` |
| Theme card tagline | Effective UI; 12px; line-height 1.375 | Muted | Metadata | `ThemeSettings.tsx` |
| Theme preview labels/pairing | Effective UI; 10px; inherited 1.5 line-height for Light/Dark labels or explicit 1.375 for the font-pairing line | Faint | Metadata, minimum 11–12px | `ThemeSettings.tsx:215-222` |
| Theme mode controls | Effective UI; 12/16px | Active contrast; inactive muted | Control | `ThemeSettings.tsx` |
| Defaults panel heading | Effective UI; 16/24px; 600 | Primary | Section heading | `DefaultsSettings.tsx` |
| Defaults field labels | Effective UI; 14/20px; 500 | Primary | Label | `DefaultsSettings.tsx` |
| Defaults help text | Effective UI; 12/16px | Muted; inline `pi-agent` uses Tailwind mono | Metadata + Code/data | `DefaultsSettings.tsx` |
| Defaults controls/link | Effective UI; 14/20px | Accent link; hover underline | Control | `DefaultsSettings.tsx` |

### 5.7 Provider, model, and capability settings

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Provider/model page headings | Effective UI; 20/28px; 600 | Primary | View title | `ProvidersSettings.tsx:319-325`, `ModelsSettings.tsx:164-216` |
| Provider detail/form heading | Effective UI; 20/28px; 600 | Primary | View title or Section heading | `ProvidersSettings.tsx:555-568` |
| Provider overlay title | Effective UI; 18/28px; 600 | Primary | Section heading | `ProvidersSettings.tsx:738-753` |
| Settings field labels | Effective UI; mostly 14/20px; provider labels inherit 400 while selected model controls use 400/500 variants | Primary | Label | `ProvidersSettings.tsx:330-375`, `ModelsSettings.tsx:164-511` |
| Settings controls/buttons | Effective UI; mainly 14/20px | Primary/muted/semantic; disabled opacity | Control | `ProvidersSettings.tsx:319-745`, `ModelsSettings.tsx:164-511` |
| Settings help/explanation | Effective UI; 12 or 14px; some 14px uses 24px line height | Muted | Metadata or Body/prose | `ProvidersSettings.tsx:319-745`, `ModelsSettings.tsx:164-511` |
| Provider/model list names | Effective UI; 14/20px; 500/600 | Ellipsis in many rows | Label | `ProvidersSettings.tsx:319-510`, `ModelsSettings.tsx:164-336` |
| Provider/model IDs | Often Tailwind mono; 12/16px | Muted; some ellipsis, some unbounded | Code/data | `ProvidersSettings.tsx:319-510`, `ModelsSettings.tsx:164-336` |
| Category overlines | Effective UI; 12/16px; uppercase; 0.1em | Muted/faint | Overline | `ProvidersSettings.tsx:319-510`, `ModelsSettings.tsx:164-336` |
| Provider badges | Effective UI; 12/16px; 600 | Semantic or primary | Metadata or Status | `ProvidersSettings.tsx:319-510`, `ModelsSettings.tsx:164-336` |
| Loading/empty/error states | Effective UI; 12 or 14px, sometimes 14px medium title | Muted/error; treatment varies | Status/feedback | `ProvidersSettings.tsx:319-745`, `ModelsSettings.tsx:164-511` |
| Capability list/detail content | Effective UI; repeated 10/12/14px list/detail pattern | Primary/muted/faint; ellipsis varies | Overline, Label, Metadata, Control | `CapabilitySettings.tsx`, `PromptsList.tsx`, `PromptDetail.tsx`, `SkillsList.tsx`, `SkillDetail.tsx`, `ExtensionsList.tsx`, `ExtensionDetail.tsx` |
| Default-model selector | Effective UI; 14/20px heading at 500; explanation, current value, labels, and states at 12/16px | Muted/warning/error; loading and unavailable-model states wrap | Label, Metadata, Status/feedback | `DefaultModelSelector.tsx:88-166` |
| Import-from-pi panel | Effective UI; 14/20px title/control at 500; paths, checkboxes, and status at 12/16px | Paths are not mono and lack long-token wrapping; semantic warning/success/error | Label, Code/data, Control, Status/feedback | `ImportPiAuthModels.tsx:20-83` |
| Chat model menu | Effective UI; search, options, and states at 12/16px; section overlines and secondary model data at 10px; provider legends 12px/600 | Model rows use constrained ellipsis; selected, disabled, loading, empty, and error states | Control, Label, Metadata, Overline, Status/feedback | `ChatModelMenu.tsx:196-395` |
| Default model menu | Trigger/search 14/20px; section/state text 12/16px; option buttons and model names/IDs inherit 16/24px; IDs use Tailwind mono | Option names and IDs lack explicit truncation; selected, disabled, loading, empty, and error states | Control, Label, Code/data, Overline, Status/feedback | `DefaultModelMenu.tsx:105-210` |

### 5.8 Dialogs

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Confirm-dialog title | Effective UI; 14/20px; 600 | Primary | Section heading | `ConfirmDialog.tsx` |
| Confirm-dialog body/actions | Effective UI; 12/16px | Muted/primary/error | Status/feedback + Control | `ConfirmDialog.tsx` |
| Create workspace/session title | Effective UI; 14/20px; 600 | Primary | Section heading | `CreateWorkspaceDialog.tsx`, `CreateSessionDialog.tsx` |
| Create dialog inputs | Effective UI; 14/20px | Primary | Control | `CreateWorkspaceDialog.tsx`, `CreateSessionDialog.tsx` |
| Create dialog labels/actions | Effective UI; 12/16px | Muted/primary | Label / Control | `CreateWorkspaceDialog.tsx`, `CreateSessionDialog.tsx` |
| Create dialog hints | Effective UI; 11px | Muted | Metadata | `CreateWorkspaceDialog.tsx`, `CreateSessionDialog.tsx` |
| Help dialog title/commands | Effective UI; base 14/20px; titles/names 600 | Primary | Section heading + Control | `HelpDialog.tsx` |
| Help dialog groups | Effective UI; 12/16px | Muted | Overline or Metadata | `HelpDialog.tsx` |
| Help arguments/descriptions | Effective UI; inherited 14/20px | Muted; truncation may be fragile | Metadata | `HelpDialog.tsx` |
| OAuth title | Effective UI; 16/24px; 600 | Primary | Section heading | `OAuthLoginDialog.tsx` |
| OAuth provider/meta | Effective UI; 12/16px | Muted | Metadata | `OAuthLoginDialog.tsx` |
| OAuth status/forms | Effective UI; 14/20px; status title 600 | Semantic/primary | Status/feedback + Control | `OAuthLoginDialog.tsx` |
| OAuth URL/event log | Effective UI; 12/16px; URL uses break-all | Event data is not consistently mono | Code/data | `OAuthLoginDialog.tsx` |
| Uninstall-resource content | Effective UI; 12–14px | Paths/packages can contain long unbroken text | Status/feedback + Code/data | `UninstallResourceDialog.tsx` |
| Install-skill title/overline/body | Effective UI; 10/12/14px with 600 overline/title variants | Semantic states; uppercase/widest overline | Section heading, Overline, Body, Status | `dialogs/InstallSkillDialog.tsx` |

### 5.9 Menus, popovers, and transient UI

| Area | Current configuration | State and text behavior | Target role | Source |
|---|---|---|---|---|
| Context-menu items | Effective UI; 12/16px | Hover surface; destructive color; labels can wrap | Control | `ContextMenu.tsx` |
| Row-menu items | Effective UI; 12/16px | Hover/destructive states | Control | `RowMenu.tsx` |
| Thinking-menu trigger/current value | Inherits footer; current value 500 | Semantic/interactive | Control | `ChatThinkingMenu.tsx` |
| Thinking-menu heading/options | Effective UI; 12/16px; heading 600 | Muted/accent/error; labels may wrap | Overline or Label + Control | `ChatThinkingMenu.tsx` |
| Toast | Effective UI; 14/20px | White on black/80; no max-width or special long-token wrapping | Status/feedback | `ToastHost.tsx` |

## 6. Category-collapse plan

### 6.1 Categories that should collapse

| Current variations | Collapse into | Reason |
|---|---|---|
| Buttons, menu items, tabs, compact selectors, row actions | **Control** | Interaction—not component type—defines the role |
| Workspace, session, file, note, prompt, skill, extension, provider, and model row names | **Label** | These are all scannable entity labels |
| Breadcrumbs, human-readable navigation paths, timestamps, counts, descriptions, argument hints, and context values | **Metadata** | They communicate supporting context rather than hierarchy; a path or ID remains Metadata when users read it as navigation context rather than a literal technical value |
| 9px, 10px, and 12px uppercase group labels | **Overline** at 11/16px | Removes three micro-scales and establishes 11px as the design-system minimum for this role |
| Empty, loading, retry, warning, error, success, queue, compaction, and changed-state copy | **Status / feedback** | Urgency should come from semantics and color, not unrelated sizes |
| Markdown code, tool output, diffs, code-oriented file previews, JSON, CodeMirror, literal/copyable IDs and paths, event logs, diagnostics locations | **Code / data** | Technical values that benefit from character distinction or alignment should share one effective mono family and predictable metrics |
| Assistant prose, user prose, note content, file-preview prose, explanatory body copy | **Body / prose** | Same reading role; area-level size preferences can remain modifiers |
| Settings panel titles currently at 14, 16, 18, and 20px | **View title** or **Section heading** | Two hierarchy levels are sufficient for this application |

### 6.2 Categories that should remain distinct

| Keep distinct | Why |
|---|---|
| Display versus Interface family | Allows subtle brand personality without reducing compact UI legibility |
| Interface versus Content family tokens | Users may want a different reading face without changing dense controls |
| Body/prose versus Label/Control | Reading text needs more line height and different wrapping behavior |
| Metadata versus Overline | Metadata contains values; overlines identify groups and use uppercase/tracking |
| Status/feedback versus Metadata | Status requires semantic color, accessibility behavior, and natural wrapping |
| Code/data versus ordinary content | Monospace alignment and whitespace behavior are functionally meaningful |
| Assistant, user, composer, and code size preferences | Existing users may value independent reading/input scales; these should modify semantic roles rather than create new roles |

### 6.3 Recommended configuration surface

Avoid exposing a setting for every component. Configure semantic categories and a small number of meaningful area modifiers:

**Family settings**

1. Display
2. Interface
3. Content
4. Monospace

**Scale settings**

1. Interface scale
2. Compact/navigation scale
3. Assistant content size
4. User content size
5. Composer size
6. Code/data size

All other sizes should derive from the semantic scale. This keeps the system configurable without recreating the current fragmentation in settings.

## 7. Recommended fonts

### 7.1 Default recommendation

#### Display — Bricolage Grotesque Variable

Use only for major view titles. It adds subtle character while remaining compatible with a developer-tool interface. Do not apply it to every heading, control, or Markdown heading.

Fallback:

```css
"Bricolage Grotesque Variable", "Bricolage Grotesque", Inter, system-ui, sans-serif
```

#### Interface — Inter Variable

Use for navigation, settings, controls, labels, metadata, and status text. It is highly legible at compact sizes, supports the necessary weights, and is already bundled.

Fallback:

```css
"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif
```

#### Content — Inter Variable

Use the same family by default to minimize visual noise. Keep Content as a separate token and preference so a future reading-oriented face can be selected independently.

Fallback: same as Interface.

#### Monospace — JetBrains Mono Variable

Use for all code and structured data. It is clear at 12–14px, has strong punctuation differentiation, and is already bundled.

Fallback:

```css
"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace
```

### 7.2 Optional additions

No new font package is necessary for the recommended default. Before adding another family, test whether an existing bundled family satisfies the role.

If future usability testing shows that Inter is too neutral for long-form content, a dedicated content face may be evaluated. This is not currently justified; adding a fourth visible family would work against the consistency goal.

### 7.3 Recommended removals

After verifying production-bundle reachability, remove imports and dependencies that remain unused:

- Fraunces Variable
- Plus Jakarta Sans
- Gloock
- Manrope Variable

Do not remove current optional theme families while theme personality presets remain supported.

## 8. Cross-cutting typography behavior

### 8.1 Truncation and wrapping

- Entity rows and navigation labels: single line, `min-width: 0`, ellipsis, and full accessible value/tooltip.
- Prose and feedback: natural wrapping.
- Errors, URLs, paths, IDs, and generated strings: `overflow-wrap: anywhere` where horizontal scrolling is not intentional.
- Code, diffs, and preserved file content: preserve formatting and scroll horizontally.
- Do not truncate essential error details without a way to reveal the complete value.

### 8.2 Interactive states

Hover, focus, selected, active, loading, and disabled states must not change family, size, weight, line height, or tracking. Use color, background, border, decoration, iconography, and opacity instead.

Disabled text must remain readable. Avoid opacity reductions that make already-faint metadata illegible.

### 8.3 Status and accessibility

- Never rely on color alone for success, warning, or error.
- Preserve explicit labels or icons.
- Use appropriate live-region semantics for asynchronous feedback.
- Do not use text below 11px.
- Keep ordinary interactive text at 13px or above unless there is a strong density reason.

### 8.4 Numeric and technical data

Use tabular numerals for counts, token/context usage, timestamps, sizes, and diagnostic positions. Use the Monospace family only when character alignment or technical distinction is useful; ordinary numeric metadata can remain Interface with tabular numerals.

## 9. Highest-priority inconsistencies to resolve

1. Create one effective monospace token and route Markdown, tools, previews, JSON, diagnostics, and CodeMirror through it.
2. Connect CodeMirror to the code/data size and line-height tokens.
3. Make the note editor use the effective Content family rather than `--font-body`.
4. Apply Display intentionally to true view titles, or remove the unused display concept. The recommendation is to apply it only to view titles.
5. Replace 9/10px microcopy with the 11px Overline or 12px Metadata role.
6. Normalize settings hierarchy to View title and Section heading.
7. Normalize all loading/empty/error/banner/toast text to Status/feedback.
8. Make chat and file-preview Markdown use the same Body/prose metrics unless a deliberate compact modifier is documented.
9. Normalize row labels and truncation across workspace, file, resource, and settings lists.
10. Replace inaccurate font-setting labels with “Theme default.”
11. Clamp persisted size values, not only slider input.
12. Remove unused font imports after bundle verification.

## 10. Suggested migration order

This is prioritization guidance, not an implementation plan.

1. **Define tokens:** family resolution, nine role metrics, semantic color use, and wrapping contracts.
2. **Fix inheritance:** establish effective Display, Interface, Content, and Monospace tokens.
3. **Unify code/data:** Markdown, tools, CodeMirror, file preview, JSON, IDs, paths, and diagnostics.
4. **Normalize microcopy:** Metadata and Overline across chat, navigation, resources, settings, menus, and diagnostics.
5. **Normalize hierarchy:** View titles and Section headings across settings and dialogs.
6. **Normalize controls and labels:** menus, buttons, form fields, and row entities.
7. **Normalize prose:** assistant/user messages, notes, previews, and explanatory settings text.
8. **Normalize feedback:** banners, queue, toast, empty/loading/error states, and ARIA behavior.
9. **Update settings:** four family categories plus six scale controls; preserve assistant/user/composer/code preferences as modifiers.
10. **Verify visually:** every theme, light/dark modes, custom family overrides, font-size extremes, long paths/IDs, localization expansion, and Electron zoom.
11. **Remove dead assets:** only after runtime and bundle verification.

## 11. Audit limitations

- This is a static source audit. It does not include a computed-style capture from a running Electron build.
- Actual system-font fallback and native control rendering can vary by platform.
- Runtime verification is still needed for font loading, ellipsis, localization expansion, zoom, and light/dark visual balance.
- Tailwind metric values are based on its standard scale and the project’s unmodified typography configuration.

These limitations do not affect the central architectural findings: MacPi currently mixes theme tokens, user overrides, fixed utilities, arbitrary sizes, and editor defaults without a shared semantic role layer.
