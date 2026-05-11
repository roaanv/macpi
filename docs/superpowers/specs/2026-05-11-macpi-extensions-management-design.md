# Extensions Management (Phase 2 of §10) — Design

**Status:** Draft, awaiting plan.

**Scope:** Phase 2 of §10. Adds the Extensions list-detail view + Biome-on-save linting on top of the shared infrastructure shipped in Phase 1 (resource root, settings, install/remove, import-from-pi, dispose-and-reattach reload). Prompts is the remaining phase.

**Non-goals (this phase):**

- Prompts view (phase 3).
- In-app TypeScript type-checking (only Biome lint).
- In-app runtime sandbox or "test this extension" affordance.
- Per-channel / per-session enable/disable overlays (still global-only).
- In-app fork / branch / version history.

## 1. Architectural decisions

### 1.1 Reuse phase-1 infrastructure

Phase 1 built reusable plumbing. Phase 2 does not refactor it; it extends it:

- `resourceRoot` setting and `ensureResourceRoot` cover extension storage at `<resourceRoot>/extensions/`.
- `resourceEnabled` map already supports `extension:<source>:<rel-path>` keys.
- `DefaultPackageManager.installAndPersist(source, { local: false })` works for both skills and extensions (pi treats packages uniformly; the package's manifest decides what kinds of resources it contributes).
- The dispose-and-reattach reload mechanism (`session.reload` IPC) is generic — any resource change can use it.
- The `macpi:skills-changed` window event will be supplemented (not renamed) with `macpi:extensions-changed`. The timeline-state hook listens to both. (A renaming refactor waits for phase 3 when we have three data points.)

The `pi-session-manager.ts` extraction the phase-1 reviewer flagged is **deferred** to a post-phase-3 cleanup. Phase 2 ships parallel `ExtensionsService` next to `SkillsService` and accepts the duplication.

### 1.2 TypeScript editor

CodeMirror 6's `@codemirror/lang-javascript` supports TypeScript via `javascript({ typescript: true })`. No type-check, no IntelliSense; just syntax highlighting and basic auto-indent. New npm dependency.

### 1.3 Biome on save

Per spec §10, "saving lints via Biome only." Implementation:

- New IPC method `extensions.lint(id) → { diagnostics: ExtensionDiagnostic[] }`.
- Main spawns `npx @biomejs/biome check --reporter=json <file>` as a child process with a 5-second timeout.
- Output parsed into a renderer-safe `ExtensionDiagnostic` shape (line, column, severity, message).
- Detail view automatically runs lint on `skills.save`-equivalent (`extensions.save`) success.
- Manual "Lint" button on the toolbar for on-demand checks without saving.
- Diagnostics render in a collapsible panel below the editor; severity color-codes the row.

Biome runs against the project's existing `biome.json` (since macpi is installed inside a Node project tree at runtime, Biome will discover the config). This means extensions are linted by the same rules as macpi's own code — a deliberate choice for consistency. If users need different rules per extension, a future phase can add per-extension Biome config support.

### 1.4 Pi load errors surface in the list

`LoadExtensionsResult.errors` is a real surface — a TypeScript syntax error in an extension prevents pi from loading it. The list view shows these errors inline (small red row with the error message + the failing path).

This differs from skills, where load diagnostics existed but were less actionable (skills are pure markdown; loader errors are rare).

### 1.5 Extension file shape

Pi accepts `.ts` files OR directories with an entry point. macpi treats both:

- Top-level `.ts` files at `<resourceRoot>/extensions/*.ts` are atomic extensions.
- Directories at `<resourceRoot>/extensions/<name>/` with an `index.ts` (or whatever pi expects — confirmed during plan-writing) are folder extensions.

For import-from-pi (`~/.pi/extensions/` → `<resourceRoot>/extensions/`), both files and directories are copied. Subdirectory contents copy recursively; skip-if-exists guards at the top level (a directory either copies whole or is skipped).

The detail view shows the **entry file** (`<dir>/index.ts` or `<file>.ts`) only. Editing other files in a directory-based extension is out of scope for v1 — users use their own editor for that.

## 2. SDK surface we depend on

From `@earendil-works/pi-coding-agent`:

- `DefaultResourceLoader({ cwd, agentDir, extensionsOverride?, ... })` — `extensionsOverride: (base: LoadExtensionsResult) => LoadExtensionsResult` is the filter hook.
- `ResourceLoader.getExtensions(): LoadExtensionsResult` — `{ extensions: Extension[], errors: Array<{ path, error }>, runtime }`.
- `Extension` shape: `{ path, resolvedPath, sourceInfo: { source, scope, ... }, handlers, tools, commands, ... }`.
- Same `DefaultPackageManager.installAndPersist/removeAndPersist` flow as skills.

## 3. Data model

### 3.1 Settings keys

No new keys. `resourceRoot` and `resourceEnabled` from phase 1 are sufficient. Enabled-map keys for extensions are `extension:<source>:<relative-path-from-extensions-subdir>`.

### 3.2 Resource id scheme

`extension:<source>:<relative-path-from-extensions-subdir>`. For a directory-based extension at `<resourceRoot>/extensions/my-ext/index.ts`, the path is `my-ext/index.ts` (relative to the extensions subdir; the entry file is recorded, not the dir).

### 3.3 No new SQL tables

Same as phase 1.

## 4. UI

### 4.1 Mode rail

Flip `extensions` from `enabled: false` to `enabled: true` in `ModeRail.tsx`.

### 4.2 Extensions mode layout

Identical structure to Skills mode:

```
┌─Mode rail─┬─Extensions sidebar──────┬─Extension detail (editor)──────────┐
│  💬 chat  │ [+ Install…] [Import]   │  ┌─manifest header──────┐          │
│  📚 skills│ ──────────────────────── │  │ name: my-ext         │          │
│  ⚙ ext   │ ☑ my-extension          │  │ source: local        │          │
│  💬 prompt│ ☐ disabled-thing        │  │ path: my-ext/index.ts│          │
│  ⚙ settings│ ⚠ broken-one (error)   │  └──────────────────────┘          │
│           │                          │  ┌─CodeMirror typescript────┐    │
│           │                          │  │ export default pi => {... │    │
│           │                          │  └──────────────────────────┘    │
│           │                          │  [Save] [Lint]                     │
│           │                          │  ┌─Biome diagnostics─────────┐    │
│           │                          │  │ 3:8 warn unused variable   │    │
│           │                          │  └────────────────────────────┘    │
└───────────┴──────────────────────────┴────────────────────────────────────┘
```

### 4.3 List view

Same structure as `SkillsList`. Differences:

- Row icon for extensions with pi load errors: ⚠ + first line of error message under the name in red.
- Row icon for extensions where Biome flagged warnings on last save: ✱ (subtle, no error color).

### 4.4 Detail view

Same shell as `SkillDetail`. Differences:

- Editor uses TypeScript mode.
- Footer adds a "Lint" button alongside "Save". Save triggers lint automatically on success.
- Below the footer, a collapsible diagnostics panel (default open if any errors exist; collapsed if only warnings).
- Manifest header includes the extension's `path` (entry file).

### 4.5 Reload banner

Reuses the existing `SkillsChangedBanner` component without rename. Both `macpi:skills-changed` and `macpi:extensions-changed` flip the same `skillsChanged` flag in `timeline-state.ts`, so the banner triggers from either resource type. The displayed text stays "Skills changed — reload to apply" for now; a proper rename to `ResourcesChangedBanner` waits until phase 3 alongside the resource-service abstraction. Minor UX wart accepted.

### 4.6 Install dialog

Reused as-is. Source input accepts npm spec, git URL, or local path. Progress events drive the same UI. The dialog is now in the toolbar of both Skills and Extensions modes.

### 4.7 Import dialog

Updated to import both skills AND extensions in one go. Result message lists per-type counts:

> Imported 3 skill file(s); 2 extension file(s) or dir(s); skipped 1.

## 5. IPC additions

New methods on `IpcMethods`:

```ts
"extensions.list": {
    req: Record<string, never>;
    res: { extensions: ExtensionSummary[]; loadErrors: Array<{ path: string; error: string }> };
};
"extensions.read": {
    req: { id: string };
    res: { manifest: ExtensionManifest; body: string };
};
"extensions.save": {
    req: { id: string; body: string };
    res: Record<string, never>;
};
"extensions.setEnabled": {
    req: { id: string; enabled: boolean };
    res: Record<string, never>;
};
"extensions.install": {
    req: { source: string };
    res: Record<string, never>;
};
"extensions.remove": {
    req: { source: string };
    res: Record<string, never>;
};
"extensions.lint": {
    req: { id: string };
    res: { diagnostics: ExtensionDiagnostic[] };
};
```

`skills.importFromPi` is renamed to `resources.importFromPi`. The handler imports both skills and extensions. The renderer dialog calls the renamed IPC.

`ExtensionDiagnostic`:
```ts
{
    severity: "error" | "warn" | "info";
    line: number;
    column: number;
    message: string;
    rule?: string;
}
```

## 6. Lint mechanism

### 6.1 Trigger points

1. On `extensions.save` success: lint runs automatically. Results posted to the renderer via the response (the save returns lint diagnostics) OR via a follow-up `extensions.lint` call. We pick the second: save and lint are separate IPCs. Save is fast; lint can be slow. The save mutation's `onSuccess` triggers `useLintExtension` to render results.

2. Manual "Lint" button: runs `extensions.lint` without saving. Useful for "did I break it before saving?"

### 6.2 Main-process implementation

```ts
// src/main/biome-runner.ts
export async function runBiomeCheck(filePath: string, timeoutMs = 5000): Promise<ExtensionDiagnostic[]> {
    // child_process.spawn('npx', ['@biomejs/biome', 'check', '--reporter=json', filePath])
    // with timeout; on success parse JSON; on timeout return a single error diagnostic.
}
```

The renderer never sees the raw subprocess. Errors (Biome not installed, parse failure, timeout) return an `ExtensionDiagnostic` with `severity: "error"` and a friendly message.

### 6.3 Why npx, not the JS API

Biome's programmatic API exists but is unstable. Spawning the CLI is more boring and survives Biome upgrades.

## 7. Pi load errors

`SkillsService.list()` ignored `LoadSkillsResult.diagnostics`. `ExtensionsService.list()` MUST surface `LoadExtensionsResult.errors`:

- The IPC response includes `loadErrors: Array<{ path, error }>`.
- The renderer joins `loadErrors` to list rows by matching `path` against each extension's `path`/`resolvedPath`. Unmatched errors render as standalone error rows above the list.

## 8. Phase 1 unification (small, in-scope)

The phase-1 reviewer flagged that `SkillsService.idFor` reads `skill.source?.id` (a fake shape from test fixtures) while `buildSkillsEnabledFilter` reads `skill.sourceInfo?.source` (the real SDK shape). They happen to produce the same ids for local skills, but disagree for package-installed skills.

Phase 2 fixes this:
- `SkillsService.idFor` and `buildSkillsEnabledFilter` both use `sourceInfo.source`.
- Test fixtures in `skills-service.test.ts` are updated to match the real SDK shape (`sourceInfo: { source: "local" }`).
- The same `idFor`-style helper is shared (not duplicated) between `SkillsService` and `ExtensionsService`.

## 9. Test strategy

**Unit:**
- `resource-id.ts` — already has `skillResourceId`; add `extensionResourceId` symmetric variant. Cover parse of `extension:src:path`.
- `biome-runner.ts` — given a temp file with known content, assert specific diagnostics return (single happy-path test + a timeout test using a fake spawner).

**Integration:**
- `extensions-service.test.ts` — `list` returns enabled flags; `list` includes `loadErrors`; `save` writes; `setEnabled` persists; `lint` returns diagnostics from a stub runner.
- `pi-import.test.ts` — extend to also copy `extensions/*` files AND directories recursively, with skip-if-exists at the top level.

**pi-integration:**
- One end-to-end: install a local-path extension, verify it appears, verify pi load errors surface when the .ts has a syntax error, toggle disabled, verify it filters out.

**Manual smoke:**
- CodeMirror TS editor (typing, undo/redo).
- Lint pipeline (write a syntax error, save, see diagnostics).
- Reload banner triggers from extensions changes the same way it does for skills.

## 10. Dependencies

New npm:
- `@codemirror/lang-javascript` ^6 (for TS editor mode).

`@biomejs/biome` is already a dev dep of the project; no install needed.

## 11. Open implementation questions (resolve in plan)

- Confirm pi's exact entry-file convention for directory-based extensions (`index.ts` vs `extension.ts` vs manifest). Resolved by reading `loadExtensionFromFactory` source.
- Confirm Biome JSON reporter output shape (line/column 1-indexed vs 0-indexed, severity values).
- Confirm `npx @biomejs/biome` resolves to the project's installed version when running from a packaged Electron app (it should — Forge bundles dependencies; verify during plan execution).

## 12. Decision log delta

Add to §13:

| # | Decision | Alternative considered |
|---|---|---|
| Dn | Phase 2 ships parallel `ExtensionsService` next to `SkillsService` | Extract a generic `ResourceService<T>` now (rejected — wait for phase 3 to see three data points) |
| Dn+1 | Biome via `npx @biomejs/biome check --reporter=json` in main process | Use Biome's JS API directly (rejected — API is less stable across versions) |
| Dn+2 | Editor edits only the entry file; multi-file directory extensions need an external editor for non-entry files | Build an in-app multi-file editor (rejected — significant complexity for low v1 value) |
| Dn+3 | Lint runs against the project's existing `biome.json`, not a per-extension config | Per-extension Biome config (deferred — start consistent, add flexibility if asked) |
| Dn+4 | `macpi:skills-changed` event supplemented by `macpi:extensions-changed`; rename to `macpi:resources-changed` waits for phase 3 | Rename now (rejected — minor churn, no benefit until prompts arrive) |
