# Skills Management (Phase 1 of §10) — Design

**Status:** Draft, awaiting plan.

**Scope:** Phase 1 of the original §10 spec. Ships the shared infrastructure (resource root setting, isolated pi loader, settings-driven enable/disable, install dialog, reload-session mechanism, import-from-pi) PLUS the Skills list-detail view. Extensions and Prompts are deferred to follow-up plans that reuse this infrastructure.

**Non-goals (this phase):**

- Extensions view (TypeScript editor + Biome on save).
- Prompts view.
- Per-channel / per-session enable/disable overlays (global-only in v1).
- In-app type-check or runtime sandbox for any resource.
- In-app fork / branch / version history.
- Hot-reload mid-stream.

## 1. Architectural decisions

### 1.1 Isolation from `~/.pi`

macpi has its own resource root, separate from pi's TUI install. **Same file formats, same conventions, same SDK APIs** — just a different directory.

Reasoning: the user wants macpi to feel like pi to power users (no surprises about layouts or behavior), but does not want the GUI and the TUI to share state. A skill edit in macpi must not silently change the TUI's behavior and vice versa.

### 1.2 Configurable resource root, default `~/.macpi`

A new global setting `resourceRoot` (default `~/.macpi`) is exposed in the Defaults settings panel with a folder picker. Power users can point it elsewhere (e.g., symlink to `~/.pi`) at their own risk.

`~/.macpi/` is auto-created on first launch if missing.

### 1.3 Phase 1 ships skills only

Skills is the simplest of the three resource types (Markdown body, simple manifest). Building it first lets us validate the shared infrastructure (isolated loader, settings overlay, install dialog, reload, import) end-to-end before taking on extensions (TS + Biome) or prompts.

## 2. SDK surface we depend on

From `@earendil-works/pi-coding-agent`:

- `DefaultResourceLoader({ cwd, agentDir, settingsManager?, skillsOverride?, ... })` — constructing with our `agentDir = resourceRoot` redirects pi's discovery to our directory. `skillsOverride: (base) => filtered` is the hook we use for the global enabled map.
- `ResourceLoader.getSkills() → { skills: Skill[]; diagnostics: ResourceDiagnostic[] }` — what we render in the list.
- `ResourceLoader.reload(): Promise<void>` — re-discovers from disk. Used after install / remove / edit, before the session is reattached.
- `DefaultPackageManager({ cwd, agentDir, settingsManager })` — same `agentDir` plumbing.
- `PackageManager.installAndPersist(source, { local: false })` — accepts npm specs, git URLs, and local paths.
- `PackageManager.removeAndPersist(source, { local: false })` — uninstall + persist.
- `PackageManager.setProgressCallback(cb)` — fires `ProgressEvent { type, action, source, message? }` during install.

The shapes above are stable in the SDK as of `pi-coding-agent` 0.74.

## 3. Data model

### 3.1 Settings keys (extend §6.4)

| Key | Type | Default | Notes |
|---|---|---|---|
| `resourceRoot` | string | `~/.macpi` | Where pi loader/package manager point at. |
| `resourceEnabled` | `Record<string, boolean>` | `{}` | Per-resource toggle. Key format: `skill:<source>:<relative-path-from-source-root>` (stable across reloads). Missing entry = enabled. |

Both stored in the existing `settings_global` row.

### 3.2 Resource ID scheme

A skill's stable id is `skill:<source>:<relative-path-from-source-root>`. `source` is the pi-package source string (`local`, an npm spec, or a git URL). For locally-authored skills the source is `local`.

This ID survives `ResourceLoader.reload()` and uninstall/reinstall as long as the source identity doesn't change.

### 3.3 No new SQL tables

Everything lives in `settings_global` for phase 1. The per-channel/per-session overlays from the original §10 are explicitly deferred — adding tables now would be premature.

## 4. UI

### 4.1 Mode rail

Today `ModeRail.tsx:5` already declares modes `chat | skills | extensions | prompts`, with the last three `enabled: false`. Phase 1 flips `skills` to `enabled: true`. The `extensions` and `prompts` entries stay disabled until their respective plans.

### 4.2 Skills mode layout

Two-pane within the main viewport (mode rail still visible on the left):

```
┌─Mode rail─┬─Skills sidebar (list)──┬─Skills detail (editor)─────────────┐
│  💬 chat  │ [+ Install…] [Import]  │  ┌─manifest header──┐              │
│  📚 skills│ ───────────────────────│  │ name: foo        │              │
│  ⚙ ext    │ ☑ my-test-skill        │  │ source: local    │              │
│  💬 prompt│ ☐ disabled-thing       │  └──────────────────┘              │
│  ⚙ settings│ ☑ from-some-package   │  ┌─CodeMirror markdown body─┐    │
│           │                        │  │ # Skill prose...          │    │
│           │                        │  └───────────────────────────┘    │
│           │                        │  [Save]                            │
└───────────┴────────────────────────┴────────────────────────────────────┘
```

Empty state on the list: heading + "+ Install…" button + "Import from ~/.pi" button.

### 4.3 Install dialog

Modal with a single text input ("Source — npm package, git URL, or local path") and an Install button. On submit:

1. Disable controls.
2. Stream progress via `setProgressCallback` events into a small inline progress area (action + source + message).
3. On `complete`, close the dialog and refresh the skills list.
4. On `error`, surface the error message inline with a retry option; do not auto-close.

### 4.4 Reload banner

Rendered above the chat composer when the renderer detects skills changed during the current session. Conditions that trigger:

- A skill file was saved.
- A skill was installed.
- A skill was removed.
- A skill's enabled state was toggled.

Banner copy: "Skills changed — reload to apply." Action button "Reload session" runs the reload mechanism (§5). Banner dismisses on reload or when the user switches sessions.

### 4.5 Skill detail view

Manifest header (read-only metadata: name, source, path, version if available) on top. Body editor below — CodeMirror 6 with `@codemirror/lang-markdown`, basic-setup, dark theme matching the app. Save button persists the body to disk via IPC. Edited-but-unsaved state shows a "•" indicator on the list row.

## 5. Reload mechanism

Pi's `ResourceLoader.reload()` re-discovers resources but does not affect an already-built `AgentSession`. The active session has a snapshot of resources at construction time.

To apply changes to a running session:

1. Renderer calls `session.reload` IPC.
2. Main process: abort any streaming turn, dispose the in-process pi session (existing `disposeSession` flow), then call `attachSession(piSessionId)` which:
   - Discovers the session file on disk.
   - Constructs a fresh `DefaultResourceLoader` (with current `resourceRoot` and `skillsOverride` enabled-filter).
   - Reattaches via `createAgentSession({ sessionManager })`.
3. Renderer's timeline state resets on `piSessionId` (existing behavior), then rehydrates from `getHistory(piSessionId)`.

The user sees the chat history preserved with a brief reset. In-flight assistant turn is lost (banner explains this is the case before the user clicks Reload).

## 6. Import from `~/.pi`

Triggered by the "Import from ~/.pi" button. The button is always present in the list toolbar (alongside "+ Install…") so it remains discoverable after the user installs their first skill.

Flow:

1. Read `~/.pi/skills/*` (using fs.readdirSync recursively).
2. Show a confirmation modal listing the files that will be copied, the ones that would overwrite (skipped), and total size.
3. On confirm: copy files into `<resourceRoot>/skills/*` preserving relative paths.
4. Refresh the list. Reload banner triggers if a session is open.

Out of scope: importing from packages installed in `~/.pi` via npm/git. Phase 1 imports only the top-level skill files.

## 7. IPC contract additions

New methods on `IpcMethods`:

```ts
"skills.list": {
    req: Record<string, never>;
    res: { skills: SkillSummary[] };
};
"skills.read": {
    req: { id: string };
    res: { manifest: SkillManifest; body: string };
};
"skills.save": {
    req: { id: string; body: string };
    res: Record<string, never>;
};
"skills.setEnabled": {
    req: { id: string; enabled: boolean };
    res: Record<string, never>;
};
"skills.install": {
    req: { source: string };
    res: Record<string, never>;  // progress arrives via macpi:pi-event channel
};
"skills.remove": {
    req: { source: string };
    res: Record<string, never>;
};
"skills.importFromPi": {
    req: { confirm: boolean };
    res: { copied: number; skipped: number };
};
"session.reload": {
    req: { piSessionId: string };
    res: Record<string, never>;
};
```

`SkillSummary` and `SkillManifest` shapes are derived from pi's `Skill` type (re-exported as a renderer-side type to avoid leaking SDK internals across the wire).

Install progress events piggyback on the existing `macpi:pi-event` channel via a new `PiEvent` variant `{ type: "package.progress"; action: "install"|"remove"|...; source: string; message?: string; phase: "start"|"progress"|"complete"|"error" }`.

## 8. Test strategy

**Unit (Vitest):**
- `resource-id.ts` — stable id generation: `skill:<source>:<path>`.
- `enabled-filter.ts` — given a base skills list and an enabled map, returns the filtered subset.
- `pi-import.ts` — given source files in a fixture dir and a target dir, copies non-overwriting files and reports counts.

**Integration (Vitest, single process):**
- Skills IPC handlers backed by a temp `agentDir` with seeded fixture skills.
- `session.reload` aborts and reattaches; mock the in-process pi session to assert dispose + reattach are called in order.
- Install with a fake source: assert the package manager's `installAndPersist` is called and progress events flow through.

**pi-integration (Vitest, slower):**
- One end-to-end: install a real local-path skill source, verify it appears in `skills.list`, toggle disabled, verify it filters out, save a body edit, verify the file on disk changed.

**Manual smoke:**
- CodeMirror editor behavior (typing, undo/redo, save).
- Reload banner appears after edit and disappears after reload.
- Import-from-pi modal flow.

Playwright Electron E2E remains deferred to §12.4's existing plan.

## 9. Dependencies

New npm dependencies:
- `@codemirror/state` ^6
- `@codemirror/view` ^6
- `@codemirror/lang-markdown` ^6
- `@codemirror/basic-setup` ^0 (or equivalent if subsumed)

Bundle impact estimated at +200 KB gzipped. Acceptable for an Electron app.

## 10. Open implementation questions

These don't block design approval; they get resolved during plan-writing or by an investigation step in the plan.

- **Where pi's local-path source resolution roots from.** If a user installs a skill from `./my-skill`, what does `local` resolve to? Need to verify it works correctly when our `agentDir` is `~/.macpi`.
- **Manifest format.** The `Skill` type from the SDK has the shape, but we should confirm whether skills are single-file (markdown with frontmatter) or directory-based (a folder with a manifest + body) before designing the save semantics.
- **What `skill:<source>:<path>` means when source is an installed npm package.** Need to confirm the path is relative to the package root and stable across reinstalls.

## 11. Decision log delta

Add to §13:

| # | Decision | Alternative considered |
|---|---|---|
| Dn | macpi resource root is isolated from `~/.pi`, configurable via setting, default `~/.macpi` | Shared via symlink (rejected — too easy to accidentally let GUI/TUI stomp each other) |
| Dn+1 | v1 enable/disable is global-only | Per-channel and per-session overlays (deferred — not yet validated worth the data-model cost) |
| Dn+2 | Phase 1 ships skills + shared infra; extensions and prompts later | All three in one plan (rejected — too much surface to validate at once) |
| Dn+3 | Reload happens via dispose + reattach (not a new SDK call) | Calling `ResourceLoader.reload()` and hoping the active session picks up — doesn't, the session is built with a snapshot |
