# macpi — Electron UI for pi.dev

**Status:** Design — approved by user 2026-05-09, awaiting written-spec review before planning.
**Owner:** roaanv
**Spec date:** 2026-05-09

## 1. Summary

macpi is a desktop Electron app that gives the [pi.dev](https://pi.dev) coding agent a Discord-style UI: free-form channels containing pi sessions, with branches surfaced as threads. It also provides management surfaces for skills, extensions, and prompts. Pi runs in-process (in an Electron utility process) via the published `@earendil-works/pi-coding-agent` SDK — there is no external pi binary.

## 2. Goals

- **Single-binary desktop app** wrapping pi-coding-agent's full programmatic SDK with no external dependencies the user has to install.
- **Discord-style information architecture**: free-form channels, sessions inside channels, branches inside sessions surfaced as threads.
- **Full management surfaces in v1**: chat, skills, extensions, prompts.
- **Three-layer settings cascade**: global → channel → session, with clear provenance.
- **Reuse pi for everything pi already does**: session storage, credentials, skill/extension/prompt discovery, branching, compaction, retry.

## 3. Non-goals (v1)

- Cross-machine sync.
- Multi-window / multi-tab. Single-window app; second launch focuses the existing one.
- Telemetry or remote logging.
- Concurrent edits to the same DB from multiple windows.
- Hot-reload of skills/extensions while a session is streaming.
- Best-effort downgrade if the DB schema is newer than the binary.
- Visual regression testing.
- Windows / Linux builds (macOS-only for v1).

## 4. Glossary

| Term | Meaning |
|---|---|
| **Channel** | User-named, free-form container in macpi. Holds zero or more pi sessions. Has its own settings layer. No implicit semantics — not tied to a project, agent, or model unless the user sets one. |
| **Session** | One pi `AgentSession` (one conversation tree). Owned by pi's `SessionManager`. Belongs to exactly one channel via `channel_sessions`. |
| **Thread** | A branch inside a pi session, surfaced in the right-side branch panel. Branches come from pi's native `SessionBeforeForkEvent` / branch-summary infrastructure. macpi does not invent branching. |
| **pi-host** | An Electron `utilityProcess` that imports `@earendil-works/pi-coding-agent` and owns all live `AgentSession` instances. |
| **Cascade** | Global → channel → session settings resolution: each layer stores only overridden keys. |

## 5. Architecture

### 5.1 Process model

```
┌────────────────────┐   IPC    ┌─────────────────────┐
│  Renderer (React)  │ <──────> │  Main (Electron)    │
│  • UI only         │  typed   │  • window mgmt      │
│  • no pi imports   │  bridge  │  • IPC router       │
│  • no fs/db calls  │          │  • SQLite owner     │
└────────────────────┘          │  • settings owner   │
                                │  • spawns pi-host   │
                                └──────────┬──────────┘
                                           │ MessagePort
                                           ▼
                                ┌─────────────────────┐
                                │  pi-host            │
                                │  (utilityProcess)   │
                                │  • imports pi SDK   │
                                │  • owns all pi      │
                                │    sessions         │
                                │  • streams events   │
                                └─────────────────────┘
```

**Boundary rationale:**

- **Renderer** has no Node integration, no pi imports — sandboxable, security-clean. Talks only via a typed `contextBridge` RPC.
- **Main** owns persistence (SQLite), window lifecycle, and IPC routing. A pi-host crash never loses macpi state.
- **pi-host** is restartable. A buggy skill or runaway tool call cannot freeze the UI. On exit, main respawns and re-attaches sessions via `SessionManager.continue(sessionId)`.

### 5.2 Communication

- **Renderer ↔ Main**: `contextBridge` exposes `macpi.invoke<T>(method, args)` (request/response) and a typed pub-sub for streaming events. All responses use a discriminated `{ ok: true, data } | { ok: false, error: { code, message } }` envelope. No throwing across IPC.
- **Main ↔ pi-host**: `MessageChannelMain` (Electron's native MessagePort). Structured-clone, no JSON parsing on every token.

### 5.3 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron | TS-everywhere; matches pi's runtime; user-specified. |
| Build | Electron Forge + Vite + TypeScript | Boring, well-documented, fast HMR. |
| UI | React 18 + TanStack Query + Tailwind | Standard; TanStack Query handles IPC fetch/mutation/cache + per-component error UI. |
| Persistence | better-sqlite3 (in main process) | Synchronous, zero-await; one `macpi.db` file in `app.getPath('userData')`. WAL mode. |
| pi integration | `@earendil-works/pi-coding-agent` ^0.74 | Published npm package. Pulls in `pi-agent-core` and `pi-ai` transitively. Source at `/Users/roaanv/opensource/pi` is research-only. |
| Testing | Vitest + Playwright Electron | Fast unit/integration; minimal E2E. |
| Lint/format | Biome | Single tool; matches pi's choice. |

## 6. Data model

macpi only persists what pi doesn't already store.

### 6.1 SQLite schema

```sql
-- Channels: free-form containers
CREATE TABLE channels (
  id          TEXT PRIMARY KEY,        -- uuid
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  icon        TEXT,                    -- emoji or null
  created_at  INTEGER NOT NULL
);

-- Mapping: channel → pi session ids
CREATE TABLE channel_sessions (
  channel_id     TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pi_session_id  TEXT NOT NULL,        -- string id from pi's SessionManager
  position       INTEGER NOT NULL,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (channel_id, pi_session_id)
);
CREATE INDEX idx_channel_sessions_session ON channel_sessions(pi_session_id);

-- Settings cascade (override-only, three layers)
CREATE TABLE settings_global (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                 -- JSON
);
CREATE TABLE settings_channel (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (channel_id, key)
);
CREATE TABLE settings_session (
  pi_session_id TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (pi_session_id, key)
);

-- UI state: ephemeral preferences
CREATE TABLE ui_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL                 -- JSON: window bounds, sidebar width, last channel, etc.
);

-- Migration tracking
CREATE TABLE _migrations (
  version  INTEGER PRIMARY KEY,
  applied  INTEGER NOT NULL
);
```

**Cascading deletes**: removing a channel deletes its `channel_sessions` rows and `settings_channel` rows. Removing a pi session (when the user explicitly deletes it via the UI) is delegated to pi's SessionManager *and* deletes our `channel_sessions` and `settings_session` rows in the same transaction.

### 6.2 What macpi does NOT store

- **Messages, branches, session metadata** — pi's `SessionManager` owns all of these.
- **Credentials** — pi's `AuthStorage` (`FileAuthStorageBackend`, default path) owns these. macpi reads from the same `~/.pi/agent/auth.json` the user populated via the pi CLI.
- **Skills / extensions / prompts inventory or definitions** — `DefaultResourceLoader` discovers them; `DefaultPackageManager` installs them.

### 6.3 Cascade resolution

```
effective[key] = session_override[key]
              ?? channel_override[key]
              ?? global_default[key]
              ?? built_in_default[key]
```

Each layer stores only overridden keys, never a full snapshot. Provenance ("where did this value come from?") is just "which table contained the key first?".

### 6.4 Settings keys (concrete)

| Key | Type | Notes |
|---|---|---|
| `model` | `{provider, modelId}` | Resolved against `ModelRegistry`. |
| `thinkingLevel` | `'low' \| 'medium' \| 'high' \| 'off'` | Clamped to model capabilities by pi. |
| `systemPrompt` | string \| null | `null` = use pi's default. |
| `cwd` | string | Per-session working directory. |
| `enabledSkills` | string[] | IDs from `ResourceLoader`. |
| `enabledExtensions` | string[] | IDs from `ResourceLoader`. |
| `enabledPrompts` | string[] | IDs (visible in `/command` autocomplete). |
| `allowedToolNames` | string[] \| null | `null` = pi defaults. |
| `noTools` | `'all' \| 'builtin' \| null` | Mirrors pi's `CreateAgentSessionOptions`. |

Compaction, retry, terminal settings: leave to pi's `SettingsManager` for v1.

### 6.5 List inheritance

For array-valued keys (`enabledSkills`, `enabledExtensions`, `enabledPrompts`), v1 default semantics is **replace wholesale**. The UI exposes a *Replace* / *Inherit + delta* toggle but ships only *Replace* in v1. The diamond-merge problem of half-state list inheritance can land later if missed.

## 7. App shell — three-pane

```
┌──────┬─────────────────┬──────────────────────────────────┬────────────────┐
│ Mode │ Channels &      │             Chat                 │   Branches     │
│ rail │ Sessions        │                                  │   (threads)    │
│      │                 │  breadcrumb: # macpi-dev > ...   │                │
│  💬  │ # macpi-dev     │  ──────────────────────────────  │  ● main        │
│  🧩  │   ▸ Add electron│  you: ...                        │   ↳ try-tauri  │
│  🧪  │     ↳ branch... │  pi:  ...                        │   ↳ utility-p. │
│  📜  │ # research      │  🔧 bash: ...                    │     ↳ +sqlite  │
│  ⚙️   │ # review        │  ✓ exit 0 · 4.2s                 │                │
└──────┴─────────────────┴──────────────────────────────────┴────────────────┘
```

- **Mode rail** (48px): Chat, Skills, Extensions, Prompts, Settings (gear, bottom).
- **Channels & Sessions sidebar** (~240px): list of channels; expanded channel shows its sessions; clicking a session opens it.
- **Chat pane** (flex): breadcrumb (`# channel > session title > active branch`), message list, composer.
- **Branch panel** (~220px): the active session's branch tree (rendered from `SessionTreeEvent`). Click to switch active branch.

### 7.1 Mode views

- **Chat** (default): the layout above.
- **Skills** / **Extensions** / **Prompts**: replace channels-sidebar + chat pane with a list-detail UI for the selected resource type. Branch panel is hidden.
- **Settings**: full-pane settings UI; the resource panes (skills/extensions/prompts) are *also* reachable from Settings.

## 8. Chat pane — streaming, tool calls, lifecycle

### 8.1 Event → UI mapping

Renderer subscribes to a single `session.events` stream from main; main forwards everything from `AgentSession.subscribe()`.

| Event | UI |
|---|---|
| token deltas (from `AgentEvent`) | Append into the live assistant bubble. Throttle DOM writes via `requestAnimationFrame`; coalesce micro-deltas. |
| thinking deltas | Collapsible block above the assistant text, dimmed/italic, collapsed by default once the final answer streams. |
| `BashToolCallEvent` / `EditToolCallEvent` / `ReadToolCallEvent` / `WriteToolCallEvent` / `GrepToolCallEvent` / `FindToolCallEvent` / `LsToolCallEvent` | Tool block, collapsed by default. Border colour = pending (blue). |
| `ToolResultEvent` | Patches the matching tool block: border → green (success) or red (error), shows duration + one-line summary. Click to expand. |
| `queue_update` | Pill row above the composer: "1 steered · 2 queued" with cancel-x on each. |
| `compaction_start` / `compaction_end` | Sticky banner inside the chat: "Compacting… 12k → 4k tokens" → "Compacted ✓" (fades after 3s) or red on failure. |
| `auto_retry_start` / `auto_retry_end` | Banner: "Retrying (2/5)…" with countdown. |
| `thinking_level_changed` | Toast bottom-right. |
| `session_info_changed` | Update breadcrumb / sidebar label. |
| `SessionTreeEvent` | Refresh branch panel; if active branch changed, scroll messages to head of new branch. |

### 8.2 Tool block rendering

- **bash** — collapsed: command (truncated 80 chars). Expanded: full command + output, monospace, copy button. Stdout > 200 lines → first 100 + "…show all" + last 100.
- **read** — collapsed: path + line range. Expanded: syntax-highlighted fragment.
- **edit / write** — collapsed: path. Expanded: unified diff (using `diff` package, already a pi dep).
- **grep / find / ls** — collapsed: query. Expanded: results list with line numbers.
- **custom tools** (from extensions): generic JSON renderer fallback. Extension-supplied React components are out of scope for v1.

### 8.3 Streaming model

- pi-host runs `AgentSession.prompt()`. Pi emits events synchronously to its listener; pi-host forwards each over the MessagePort to main, which forwards to renderer.
- Renderer keeps a per-session in-memory state machine: `idle → streaming-text → tool-call-pending → tool-call-resolved → streaming-text → idle`.
- macpi does **not** persist message text — pi's `SessionManager` already does. On open, renderer requests the current message log from pi-host and renders it; from there, live-updates from events.

### 8.4 Composer + steering

While streaming, sending a new message offers two buttons: **Steer** (abort the current run and inject this prompt) or **Queue** (deliver after the current turn finishes via pi's `streamingBehavior: "followUp"`). Outside streaming, plain Send. Pi's `streamingBehavior: "steer"` (queue between tool calls) is intentionally **not** surfaced in v1 — for text-only turns it's indistinguishable from followUp, and for tool-using turns we'd want a separate UI affordance to make the timing distinction clear; both can wait for a later milestone. `/command` and `@skill` autocomplete pull from `ResourceLoader` + slash commands (already provided by pi).

## 9. Settings UI

Each setting row shows: **value** + **provenance badge** (one of `inherited: global` / `override: channel` / `override: session`). Overridden rows show "Reset to <next layer>" — deletes only that key from the current layer. No bulk-reset footgun.

Settings entry points:

- **Global** — gear icon at the bottom of the mode rail.
- **Channel** — gear next to the channel name.
- **Session** — gear next to the session title in the chat breadcrumb.

Same React component, different scope passed in.

### 9.1 Hand-off to pi

macpi does not write into pi's config files. The cascade is computed in main and injected into `createAgentSession({ ... })` per session. Pi's own `SettingsManager` continues to serve its project/global config; our cascade overrides that explicitly.

```ts
// pi-host
const effective = await macpi.settings.resolve(channelId, sessionId);
const result = await createAgentSession({
  cwd: effective.cwd,
  model: effective.model,
  thinkingLevel: effective.thinkingLevel,
  tools: effective.allowedToolNames,
  noTools: effective.noTools,
  // skills/extensions/prompts wired via ResourceLoader filter
});
```

## 10. Skills / extensions / prompts management

Three list-detail views, all backed by pi's `DefaultResourceLoader` and `DefaultPackageManager`. v1 covers list, view, enable/disable, **edit**, install.

**Isolation:** macpi uses its own resource root, separate from `~/.pi`. The setting `resourceRoot` (default `~/.macpi`) is passed to pi's loader/package manager as `agentDir`. macpi behaves like pi but doesn't share state with a co-installed pi TUI. Empty first-run state offers an "Import from ~/.pi" affordance that copies (not symlinks) the user's skills/prompts/extensions into `~/.macpi`.

**Phasing:** §10 ships in three plans. **Phase 1 = skills + the shared infrastructure** (resource root setting, isolated loader/package manager wiring, install dialog with progress, settings-driven enable/disable, reload-session mechanism, import-from-pi). **Phase 2 = extensions** (adds TypeScript editor + Biome on save). **Phase 3 = prompts**. Each phase reuses the infrastructure laid down by phase 1. See `docs/superpowers/specs/2026-05-11-macpi-skills-management-design.md` for the phase 1 detail.

- **List**: discovered resources with name, source (path/URL), version, enabled state.
- **Detail (view + edit)**: manifest, body, and content visible. **CodeMirror 6** as the in-app editor (lighter and more tree-shakable than Monaco):
  - Skills / prompts (Markdown): Markdown-mode editor with preview tab.
  - Extensions (TypeScript): TS-mode editor; no in-app type-checking or runtime — saving lints via Biome only. Full type-check / runtime errors surface when the session is reloaded with the new extension.
- **Enable / disable** toggles update the global settings layer in v1 (`app_settings.resourceEnabled`). Per-channel and per-session overlays are deferred until we have a real need for them.
- **Install**: existing pi package-manager flow surfaced as a UI dialog. Single source input accepts npm specs, git URLs, and local paths; live progress driven by pi's `setProgressCallback`.
- **Reload semantics**: edits to a resource take effect for *new* sessions automatically (pi's `ResourceLoader` re-discovers on session start). For an active session, the active pi `AgentSession` was built with a resource snapshot at construction time and does not pick up edits mid-stream. The chat shows a *Reload session* affordance that disposes the in-process pi session and reattaches it via the existing `attachSession(piSessionId)` flow, which constructs a fresh `ResourceLoader` and replays the persisted session log. In-flight assistant turn is lost. (Hot-reload mid-stream remains a non-goal.)
- **Editor scope**: in v1 the editor edits the resource files in place at their on-disk source under `resourceRoot`. There is no in-app fork / branch / version-control flow — version history is whatever the user's git/working tree gives them.

## 11. Error handling & recovery

| Failure | Detection | Recovery |
|---|---|---|
| Pi exception during a turn | Caught at the turn boundary in `PiSessionManager` (try/catch around the SDK call) | Red banner in chat; session stays alive; in-flight turn is lost; user can retry. Banner shows error code + message. |
| Uncaught exception in main | `process.on('uncaughtException' \| 'unhandledRejection')` | Write a crash report (stack + last 200 log lines) to `app.getPath('logs')/crash-<ts>.log`, show an error dialog, then quit. Relaunching reopens DB cleanly. No auto-respawn. |
| Pi SDK throws (transient) | `auto_retry_*` events from pi | Banner inside chat with attempt counter. |
| Pi SDK throws (non-retryable: auth, model not found) | Errors surface via session events / promise rejections | Red banner in chat; session stays alive; user can fix and retry. |
| Provider auth failure | Caught at session-start and first request | Blocking modal *only* when starting a new session; banner with *Open auth settings* / *Use different provider* otherwise. No silent retries. |
| Codex OAuth expiry | Same as auth failure | Banner action triggers pi's OAuth flow (delegated to pi). |
| SQLite open failure | DB module wraps every call | Recovery dialog: *Open data folder* / *Restore last backup* (`macpi.db.bak`) / *Start fresh (rename old db)*. Never silently deletes. |
| SQLite per-call failure | DB module | Retry once, surface to caller. UI shows error per action; no crash. |
| Migration failure | Migration runner | Transactional rollback; abort startup; same recovery dialog. |
| DB schema newer than binary | Open-time check | Refuse to open; tell user to update macpi. No best-effort downgrade. |
| IPC desync | Discriminated `{ ok: false }` envelope | Per-component error UI via TanStack Query. Unknown method → log + `{ ok: false, code: 'unknown_method' }`. |

### 11.1 Backups

`macpi.db` snapshotted to `macpi.db.bak` on every app start. Single backup, overwrite each launch. Enough to recover from a bad migration.

### 11.2 Logging

Two streams in `app.getPath('logs')`: `main.log` (main process + in-process pi) and `renderer.log`. Daily rotation, 7 days retained. Settings → *Open logs folder* link. No telemetry, no remote logging in v1.

## 12. Testing strategy

Four layers, scaled by cost-vs-confidence.

### 12.1 Layer 1 — Unit (Vitest)

Per-module pure functions. No Electron, no DB, no pi.

- **Settings cascade resolver** — heaviest coverage. Provenance, missing keys, list-replace semantics.
- **Migration runner** — N migrations against in-memory SQLite, including failure-rollback case.
- **IPC envelope** — `{ ok, data | error }` shape, error code mapping.
- **Branch-tree builder** — from `SessionTreeEvent` snapshot to nested list. Pure.
- **Tool-block renderer pure helpers** — diff parsing, output truncation rules.

### 12.2 Layer 2 — Integration (Vitest, single process)

Main-process modules wired together with real dependencies (real SQLite on tmp file, real settings module), pi boundary stubbed via a small `spawn / send / subscribe` interface.

- Settings end-to-end: open DB, write at each layer, resolve, delete, assert provenance.
- DB module: migrations + WAL + crash-after-tx tests.
- IPC router with mock pi-host: each method round-trips the discriminated result.
- Channel/session lifecycle: create channel, create session (mocked pi), bind to channel, delete channel cascades.

We never mock `AgentSession` itself — too leaky. Pi-shape tests live in Layer 3.

### 12.3 Layer 3 — pi integration (Vitest, slower)

Real pi-host running real `createAgentSession()`, with a **fake LLM provider** registered via pi's custom-provider API. Returns scripted token streams and tool calls.

- Event forwarding: renderer sees the same shape as `AgentSessionEvent`.
- Branching: programmatic fork → `SessionTreeEvent` arrives → branch tree updates.
- Crash + restore: SIGKILL pi-host mid-stream; assert respawn + `SessionManager.continue` re-attaches.

Marked `@slow`, runs in CI but not in the watch loop.

### 12.4 Layer 4 — E2E (Playwright Electron, very few)

Golden path only.

- App launches, creates a channel, creates a session, sends a prompt, sees a streamed response (against the same fake provider as Layer 3).
- Settings panel: change model at channel level, see the badge update.
- Crash recovery: trigger a forced pi-host exit via a hidden dev-only IPC method, see the toast and continued chat.

### 12.5 CI shape

- `make test` — Layers 1+2 (target < 10s).
- `make test-all` — all four.
- CI runs all four on PRs; local watch runs only Layers 1+2.

### 12.6 Out of scope

- Real LLM providers (cost, flakiness, not our code).
- Cross-platform packaging (macOS only for v1).
- Visual regression / screenshot tests.

## 13. Decision log

Choices made during brainstorming with the user, in order:

| # | Decision | Alternative considered |
|---|---|---|
| D1 | **Channel = free-form container** | Channel = project, channel = agent preset, hybrid project+preset. |
| D2 | **Thread = branch in a session** | Thread = whole session, thread = topic group, no thread layer. |
| D3 | **Pi runs embedded in the Electron main process** via the published SDK | Originally specced as a `utilityProcess` for crash isolation; reverted during foundation execution per user preference: "the whole reason I wanted to go with the pi sdk is to NOT start a real (OS) process." A buggy skill or runaway tool call can now block main's event loop — accepted trade-off; can wrap in a worker_thread later if it becomes a real problem. Other rejected options: spawning the pi CLI as a subprocess per session (RPC), single multiplexed pi subprocess. |
| D4 | **MVP includes chat + full management surfaces** (skills + extensions + prompts) | Chat-first, chat + prompts only, settings-first. |
| D5 | **Three-layer cascade** (global → channel → session) | Global + session only; channel + session only; reusable presets. |
| D6 | **Three-pane shell** (mode rail / channels+sessions / chat / branches) | Two-pane (mode tabs in sidebar, branches inlined). |
| D7 | **Depend on `@earendil-works/pi-coding-agent` (npm)**; pi source is research-only | Build on `pi-agent-core` and reimplement coding-agent layer (rejected — too much scope). |

## 14. Open items / future work

- Hot-reload of skills/extensions mid-stream.
- Multi-window.
- Cross-machine sync.
- In-app version control / forking / history for skill+extension+prompt edits (v1 edits files in place; user's existing git is the history).
- In-app type-checking / runtime sandbox for extension edits (v1 only lints).
- Inherit-with-delta semantics for list settings.
- Extension-supplied React components for custom tool blocks.
- Windows / Linux builds.
- Visual regression testing.

## 15. Glossary of pi APIs we depend on

For traceability, the specific pi-coding-agent surface this design depends on:

- `createAgentSession(options)`, `AgentSession`, `AgentSessionEvent`, `AgentSessionEventListener`, `PromptOptions`
- `SessionManager` (continue, list, persist)
- `SettingsManager` (project + global config we don't shadow)
- `AuthStorage` + `FileAuthStorageBackend` (default path; we don't replace)
- `ModelRegistry`
- `DefaultResourceLoader`, `DefaultPackageManager`
- `ExtensionRunner`, `Extension`, `ExtensionAPI` (read-only consumption in v1)
- Tool factories: `createReadTool`, `createBashTool`, `createEditTool`, `createWriteTool`, `createGrepTool`, `createFindTool`, `createLsTool`
- Events: `BashToolCallEvent`, `EditToolCallEvent`, `ReadToolCallEvent`, `WriteToolCallEvent`, `GrepToolCallEvent`, `FindToolCallEvent`, `LsToolCallEvent`, `ToolCallEvent`, `ToolResultEvent`, `TurnStartEvent`, `TurnEndEvent`, `SessionStartEvent`, `SessionShutdownEvent`, `SessionTreeEvent`, `SessionBeforeForkEvent`

If any of these change shape between pi 0.74.x and the version we ship against at implementation time, this section gets updated and the affected design sections re-checked.
