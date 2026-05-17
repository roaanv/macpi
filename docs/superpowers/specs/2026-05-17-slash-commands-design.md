# Slash Commands — Design

**Status:** shipped
**Author:** macpi
**Date:** 2026-05-17

## 1. Summary

Add slash-command support to the chat composer. Typing `/` as the first
character of the first line opens an autocomplete popup listing built-in
commands, user prompt templates, and skills. Enter dispatches the
highlighted command:
- **Prompt templates** expand into the composer (positional args + slicing
  supported), where the user can edit before sending.
- **Built-in commands** (`/help`, `/clear`, `/copy`, `/new`, `/name <text>`,
  `/compact [prompt]`, `/reload`) run renderer-local effects or IPC calls.
- **`/skill:<name>`** is passthrough text — pi's SDK already parses it.

Pi-bound commands (`/compact`, `/reload`) are blocked with a toast while
the agent is streaming. Local commands always work.

## 2. User-visible behaviour

### Trigger

The popup opens when the composer's content starts with `/` and the cursor
is on line 1 (no newline yet). It closes on Escape, on a click outside, or
when the input no longer satisfies the trigger condition. Mid-prose `/`
(e.g. URLs, JSX, comments anywhere after the first character) stays plain
text.

### Popup

Anchored above the composer textarea, full composer width, max-height
~240px with internal scroll. Each row:
- **Name** (left, bold) — e.g. `/compact`
- **Argument hint** (middle, muted) — e.g. `[prompt]` or `<text>`
- **Description** (right, muted, truncates)

Highlighted row uses the same `bg-indigo-500/20` treatment as selected
file-tree rows. Match scoring: case-insensitive prefix → substring →
alphabetic. No frecency in v1.

### Keyboard

| Key | Effect |
|---|---|
| `↑` / `↓` | Move highlight (wraps at edges) |
| `Enter` | Dispatch highlighted command (or no-op if "No matches") |
| `Tab` | Complete the command name into the composer text without dispatching; cursor moves past the name + 1 space, ready for args |
| `Esc` | Close popup, leave input intact |
| `Click` on row | Same as Enter |

When `slashOpen === true`, `↑`/`↓` navigate the popup, NOT the message
history. When `slashOpen === false`, message history nav is unchanged.

### Arg-hint mode

Once the user has typed past the command name (i.e. there's a space after
the name), the popup switches to **arg-hint mode**: same row stays
highlighted, no autocomplete on args, just shows the argument hint as a
reminder.

### Help dialog

`/help` opens a modal listing all available commands grouped by
**Built-in / Prompt Templates / Skills**. Each row shows name, argument
hint, and description. Esc closes.

### Empty states / error states

| Condition | UI |
|---|---|
| No matches for `/xyz` | Single "No matches" row in popup; Enter is a no-op |
| `/name` with no args | Arg-hint mode; Enter shows toast "Usage: /name <text>" |
| Template file missing on disk between list + dispatch | Toast "Template not found"; popup closes; input restored |
| `prompts.readBody` IPC error | Toast with `error.message`; popup closes |
| `/compact` / `/reload` while streaming | Toast "Wait for the agent to finish"; input intact; popup stays open |
| Pi IPC error (`session.compact`, `session.reload`) | Existing per-IPC error path (banner / toast) |

## 3. Architecture

### 3.1 Module layout

```
src/renderer/slash/
  parse.ts          // input string → {name, args} | null
  expand.ts         // template body + args → expanded text
  registry.ts       // built-in command list + match(query) sorter
  templates.ts      // adapter: PromptSummary[] → SlashCommand[]
  dispatch.ts       // SlashCommand × ctx → SlashAction
  types.ts          // SlashCommand, SlashAction, SlashDispatchCtx

src/renderer/components/
  SlashPopup.tsx    // popup UI: rows, highlight, keyboard nav
  HelpDialog.tsx    // /help target
  Composer.tsx      // MODIFY: detect slash trigger, render popup, wire dispatch
```

Pure functions in `parse.ts`, `expand.ts`, `dispatch.ts`, `registry.ts` —
fully unit-testable without React.

### 3.2 Core types (`slash/types.ts`)

```ts
export interface SlashCommand {
  name: string;                   // e.g. "compact", "review" (no leading slash)
  description: string;
  argumentHint?: string;          // e.g. "[prompt]", "<text>"
  kind: "builtin" | "template" | "skill";
  /** False = blocked during streaming; true = always available. */
  availableDuringStream: boolean;
}

export type SlashAction =
  | { kind: "replace"; text: string }
  | { kind: "send"; text: string }
  | { kind: "run"; effect: () => void | Promise<void> }
  | { kind: "ipc"; method: IpcMethodName; args: unknown }
  | { kind: "block"; reason: string };

export interface SlashDispatchCtx {
  streaming: boolean;
  piSessionId: string;
  channelId: string | null;
  lastAssistantText: () => string | null;     // walks snapshot.timeline
  openHelpDialog: () => void;
  showToast: (message: string) => void;
  clearComposerInput: () => void;             // /clear and post-IPC reset
  onSessionCreated: (newPiSessionId: string) => void;
}
```

`SlashAction` is the contract between dispatch and the Composer. Composer
interprets each variant:

| Action kind | Composer behaviour |
|---|---|
| `replace` | `setInput(text)`, close popup, refocus textarea, cursor at end |
| `send` | Submit via existing `onSend(text, defaultIntent())` |
| `run` | Call `effect()`, clear input, close popup |
| `ipc` | Call `invoke(method, args)`, clear input, close popup; on error toast |
| `block` | `showToast(reason)`, leave input + popup intact |

### 3.3 Parse semantics (`slash/parse.ts`)

```ts
export interface ParsedSlash {
  name: string;
  args: string[];
}

export function parse(input: string): ParsedSlash | null;
// Rules:
// - Returns null if input doesn't start with "/".
// - Returns null if input contains a newline before the first space
//   (first-line-only).
// - Name = chars between "/" and first space (or end). May contain
//   ":" (for /skill:name); excludes whitespace.
// - Args = whitespace-split tokens after the first space, with double-
//   quoted spans preserved as single args. Bare quotes are dropped.
// - Empty input "/" → {name: "", args: []}.
```

### 3.4 Expansion (`slash/expand.ts`)

```ts
export function expand(body: string, args: string[]): string;
// Substitutions (matches pi TUI):
// - $1, $2, ... → positional args (missing → empty string)
// - $@ or $ARGUMENTS → all args joined by single space
// - ${@:N} → args from N (1-indexed), joined by space
// - ${@:N:L} → L args starting at N, joined by space
// Identifiers that are NOT one of the above are left untouched
// (e.g. "$foo" stays "$foo").
```

### 3.5 Registry + match (`slash/registry.ts`)

```ts
export function builtinCommands(): SlashCommand[];
// Hard-coded list of the 7 built-ins.

export function match(query: string, commands: SlashCommand[]): SlashCommand[];
// query = the post-slash prefix (e.g. "co" for "/co").
// Case-insensitive. Sort: exact-prefix > substring > alpha.
// Returns [] if no matches.
```

Built-ins (v1):

| Name | Args | `availableDuringStream` | Dispatch result |
|---|---|---|---|
| `help` | — | true | `{kind:"run", effect: ctx.openHelpDialog}` |
| `clear` | — | true | `{kind:"run", effect: ctx.clearComposerInput}` |
| `copy` | — | true | `{kind:"run", effect: async () => { const t = ctx.lastAssistantText(); if (!t) { ctx.showToast("Nothing to copy"); return; } await navigator.clipboard.writeText(t); ctx.showToast("Copied"); }}` |
| `new` | `[cwd]` | true | `{kind:"ipc", method:"session.create", args:{channelId, cwd?}}` + `onSessionCreated` |
| `name` | `<text>` | true | If `args.length === 0`: `{kind:"run", effect: () => ctx.showToast("Usage: /name <text>")}`. Else: `{kind:"ipc", method:"session.rename", args:{piSessionId, label: args.join(" ")}}` |
| `compact` | `[prompt]` | false | `{kind:"ipc", method:"session.compact", args:{piSessionId, prompt: args.join(" ") \|\| undefined}}` |
| `reload` | — | false | `{kind:"ipc", method:"session.reload", args:{piSessionId}}` |

### 3.6 Templates (`slash/templates.ts`)

```ts
export function templateCommands(prompts: PromptSummary[]): SlashCommand[];
// Per prompt: { name: prompt.name, description, argumentHint,
//   kind:"template", availableDuringStream: true }.
// The body is NOT included — it's fetched on dispatch via prompts.readBody.

export async function dispatchTemplate(
  prompt: PromptSummary,
  args: string[],
  invoke: <M>(method: M, args: unknown) => Promise<...>,
): Promise<SlashAction>;
// Calls invoke("prompts.readBody", { id: prompt.id }), expands the body,
// returns {kind:"replace", text}.
// On IPC error returns {kind:"run", effect: showToast(...)}.
```

### 3.7 Skills passthrough

Skills appear in the popup (via `skillCommands(skills)`) but their dispatch
returns `null`. When the user presses Enter on a `/skill:<name>` row, the
popup closes and the input is left as-is; the user submits normally and pi
parses the `/skill:<name>` prefix on its end.

### 3.8 Dispatcher (`slash/dispatch.ts`)

```ts
export function dispatch(
  cmd: SlashCommand,
  parsed: ParsedSlash,
  ctx: SlashDispatchCtx,
): SlashAction | null;
// 1. If !cmd.availableDuringStream && ctx.streaming → return {kind:"block"}.
// 2. Switch on cmd.kind / cmd.name → return the appropriate SlashAction.
// 3. For skill: return null (signals Composer to pass through).
```

### 3.9 New IPC

- **`session.compact`**
  - Req: `{ piSessionId: string; prompt?: string }`
  - Res: `{}`
  - Wraps `agentSession.compact(prompt)` from the pi SDK on the main side.
- **`prompts.readBody`**
  - Req: `{ id: string }`
  - Res: `{ body: string }`
  - Reads the raw `.md` file at `PromptSummary.source` + `relativePath`.
    Uses `PromptsService.readBody(id)` (new method) which already knows
    the source/path mapping.

Both follow the existing `IpcRouter.register(...)` pattern with `ok`/`err`
return shapes. Errors map to `IpcResult` codes: `not_found`,
`permission_denied`, `compact_failed`.

### 3.10 Composer changes (`Composer.tsx`)

Additions:
- `slashOpen: boolean` state (derived but stable; updated via effect on
  input change and on Escape).
- `slashHighlight: number` state.
- A `useMemo` building `commands = [...builtinCommands(), ...templateCommands(prompts), ...skillCommands(skills)]` and `matches = match(query, commands)`.
- `<SlashPopup>` child, props: `{open, query, matches, highlight,
  onHighlight, onPick}`.
- Key handler: when `slashOpen`, intercept `↑`/`↓`/`Enter`/`Tab`/`Esc`
  before the existing handler. Otherwise fall through.
- A dispatcher wrapper that takes the picked command, calls `dispatch(...)`
  and interprets the returned `SlashAction`.

The existing history navigation, send/steer/queue buttons, and submit
behaviour are unchanged.

### 3.11 ChatPane wiring

ChatPane already passes `snapshot`, `piSessionId`, `onSelectSession`, and
the various mutation callbacks to Composer (some of these via the
`onSend` closure). Composer needs:
- `channelId` (currently derived in ChatPane as `sessionChannel.data?.channelId`)
- `openHelpDialog` (new state in ChatPane; renders `<HelpDialog>` when set)
- `lastAssistantText` (closure over `snapshot.timeline`)
- `onSessionCreated` (existing `onSelectSession` works as-is)
- `showToast` (new app-level `useToast()` if one doesn't exist, else a
  minimal local toast; spec accepts either implementation)

These come in as new Composer props.

## 4. Data flow

```
User types "/co"
  → setInput("/co")
  → effect: slashOpen = isSlashTrigger("/co") = true
  → memo: matches = match("co", commands) = [/compact, /copy, …]
  → <SlashPopup open=true query="co" matches=[…] highlight=0 />

User presses ↓
  → setSlashHighlight(1)
  → popup re-renders; /copy is highlighted

User presses Enter (streaming = false)
  → cmd = matches[1] = /copy
  → parsed = parse("/co") = {name:"co", args:[]}
  → action = dispatch(cmd, parsed, ctx)
        = {kind:"run", effect: copyLastAssistantToClipboard}
  → composer: setInput(""), setSlashOpen(false), effect()
  → toast: "Copied"

User types "/myreview \"PR-URL\""
  → Enter
  → cmd = templateCommands[…] for "myreview"
  → parsed = {name:"myreview", args:["PR-URL"]}
  → action = await dispatchTemplate(prompt, args, invoke)
        = {kind:"replace", text:"Review PR PR-URL:\n\n…"}
  → composer: setInput(text), setSlashOpen(false), focus + cursor at end
  → User edits, presses Enter, normal send() path fires
```

## 5. Error handling

See §2 "Empty / error states" table. All toasts auto-dismiss after 3
seconds. The composer textarea always remains focusable; popup never
steals focus from the textarea.

## 6. Testing

### Unit — pure (no React)

- `tests/unit/slash-parse.test.ts`
  - `/foo` → `{name:"foo", args:[]}`
  - `/foo bar baz` → `{name:"foo", args:["bar","baz"]}`
  - `/foo "a b" c` → `{name:"foo", args:["a b","c"]}`
  - `/skill:fmt` → `{name:"skill:fmt", args:[]}`
  - `foo` → `null`
  - `/` → `{name:"", args:[]}`
  - `/foo\nbar` → `null` (newline before space — first-line rule)
- `tests/unit/slash-expand.test.ts`
  - `$1`, `$2` positional
  - `$@` and `$ARGUMENTS` joined
  - `${@:2}` slice from N
  - `${@:2:3}` slice length L
  - Missing args render as empty string
  - Unknown identifiers like `$foo` left untouched
- `tests/unit/slash-registry.test.ts`
  - `builtinCommands()` returns 7 entries with documented shape
  - `match("")` returns all input commands sorted alpha
  - `match("co")` returns `/compact` before `/copy` (exact prefix wins; alpha among ties)
  - `match("xyz")` returns []
- `tests/unit/slash-dispatch.test.ts`
  - `/help` → `{kind:"run", …}`
  - `/compact` + streaming=true → `{kind:"block", reason}`
  - `/compact` + streaming=false → `{kind:"ipc", method:"session.compact", args:{piSessionId, prompt:undefined}}`
  - `/compact "force"` + streaming=false → args includes `prompt:"force"`
  - `/name foo bar` → `{kind:"ipc", method:"session.rename", args:{piSessionId, label:"foo bar"}}`
  - `/name` (no args) → `{kind:"run", effect: showToast("Usage: /name <text>")}` (or equivalent)
  - skill command → `null`

### Component (RTL + jsdom)

- `tests/unit/slash-popup.test.tsx`
  - Renders rows: name, arg-hint, description
  - Highlight class on the active row
  - `↑`/`↓` move highlight; wraps at edges
  - Click on row fires `onPick(command)`
  - Empty matches → "No matches" row, Enter is a no-op

### Manual smoke (documented post-implementation in spec §9)

1. `/help` opens the dialog; lists 7 built-ins + N prompts + N skills.
2. Type `/co`, `↓` highlights `/copy`, Enter copies last assistant message
   (verify with `pbpaste` on macOS).
3. `/compact` while agent is streaming → toast appears, no IPC fires.
4. `/compact` while idle → existing CompactionBanner appears, compaction
   completes.
5. `/skill:fmt` — popup shows skill name, Enter sends literal text; pi
   acts on it.
6. Create `~/.pi/agent/prompts/mytest.md` with body `Hello $1`. Reload.
   Type `/mytest world`, Enter → composer text becomes `Hello world`,
   Send delivers `Hello world`.
7. `/foo` (no such command) → "No matches" row, Enter does nothing.
8. Mid-prose slash (`How does /etc work?`) → no popup (not first-char).
9. Type `/`, press Tab on highlighted `/compact` → composer text becomes
   `/compact ` (cursor past space).

## 7. Non-goals (deferred)

- **Mid-line slash detection.** `/` triggers only at first-char-of-first-
  line.
- **Skill arg autocomplete.** `/skill:<name>` is plain-text passthrough.
- **Frecency / recently-used commands first.** Alpha sort is enough.
- **Multi-step argument flows.** `/name` doesn't open a second prompt.
- **Cmd+P keybind.** `/` is the only opener in v1.
- **Pi-TUI parity for `/settings`, `/model`, `/resume`, `/quit`, `/tree`,
  `/fork`, `/clone`, `/export`, `/share`, `/hotkeys`, `/changelog`.** The
  GUI covers these.
- **Per-command arg validation.** User-supplied text passes through.

## 8. Dependencies

No new npm packages. Uses existing `usePrompts()`, `useSkills()`,
TanStack Query, `IpcRouter`, `react`, `react-dom`.

**New primitive:** a minimal `ToastHost` component + `useToast()` hook
mounted once at the app root. API:

```ts
const { showToast } = useToast();
showToast("Copied");                            // info
showToast({ message: "Wait for the agent…",   // explicit kind
            kind: "warn" });
```

Single in-flight toast; new toasts replace any current one. Auto-dismiss
after 3s; click-to-dismiss. Anchored bottom-center over the chat pane.
~30 lines; needed once for slash commands but reusable elsewhere.

## 9. Implementation

Implemented per `docs/superpowers/plans/2026-05-17-macpi-slash-commands.md`.

Spec adjustments during implementation:
- The `SlashAction` union gained a `{kind:"error", message}` variant
  (replaces an earlier "effect that throws" pattern in dispatchTemplate).
  The Composer's switch handles it by toasting the message.
- The toast primitive (`useToast` + `ToastHost`) exposes a tiny test-only
  `subscribeForTests` export because the project's test infrastructure is
  node-only (no jsdom / RTL). Production code uses `useToast()`.
- The Composer's slash-popup add a `suppressedFor: string | null` ref so
  that pressing Escape (or picking a skill) doesn't immediately re-open
  the popup on the next Enter. Suppression clears when the input changes.
- `session.compact` IPC handler maps "unknown session" → `not_found` for
  parity with `session.reload`.
- Body fetch reused the existing `prompts.read` IPC instead of adding a
  new `prompts.readBody`.

Manual smoke per §6 deferred to user testing on macOS — automated tests
cover parse, expand, registry, dispatch (incl. /new + /reload), templates
adapter, and the toast primitive (~40 new tests; full suite 445/445).
