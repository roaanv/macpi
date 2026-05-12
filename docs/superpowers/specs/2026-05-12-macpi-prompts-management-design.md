# macpi prompts management — design spec

**Status:** Design — approved by user 2026-05-12.
**Owner:** roaanv
**Phase:** §10 Phase 3 (final of three).
**Parents:**
- master spec `docs/superpowers/specs/2026-05-09-macpi-pi-dev-ui-design.md` §10
- phase 1 (skills) `docs/superpowers/specs/2026-05-11-macpi-skills-management-design.md`
- phase 2 (extensions) `docs/superpowers/specs/2026-05-11-macpi-extensions-management-design.md`

## 1. Summary

Phase 3 adds a prompts management surface mirroring the skills mode. List, view, edit (Markdown), enable/disable, install, and selective import from `~/.pi/agent/prompts`. Differences from skills: the list exposes pi's `description` and `argumentHint` metadata, and pi's `noPromptTemplates` filter (not `noSkills`) is what turns disabled prompts off at session start. Everything else — resource root isolation, package-manager-driven install, settings-driven enable map, reload banner, import dialog — reuses Phase 1 infrastructure verbatim.

## 2. Architectural decisions

### 2.1 Reuse phase 1 infrastructure, no new primitives

The shared bits (resource root, isolated `DefaultResourceLoader` + `DefaultPackageManager`, install progress events, `resourceEnabled` settings map, reload session mechanism, import picker) all carry over. Adding prompts is a strict extension: new IPC namespace, new mode component, new filter callback.

### 2.2 List shows description + argumentHint

Pi's `PromptTemplate` carries `description` and optional `argumentHint`. These are the user's primary way to remember what a prompt does and how to invoke it. Surfacing them in the list (not just the detail view) matches pi's own TUI affordance and lets the list serve as both browse-and-pick UI.

### 2.3 Markdown-mode editor; no preview pane in v1

Prompts are short Markdown bodies with optional placeholders (`$1`, `$@`, `$ARGUMENTS`). The detail view uses the same CodeMirror 6 Markdown editor used for skills. The master spec mentions a "preview tab" for Markdown editors — phase 1 shipped without one; this phase keeps that decision. A preview is more useful for skills/prompts than for source code, but it's an additive UX improvement, not a blocker, and lives outside the v1 scope of this phase.

## 3. SDK surface we depend on

- `ResourceLoader.getPrompts() → { prompts: PromptTemplate[]; diagnostics }` — discovery.
- `PromptTemplate.{name, description, argumentHint?, content, sourceInfo, filePath}` — display + edit data.
- `createAgentSession({ noPromptTemplates: boolean })` — the kill-switch we drive from `resourceEnabled` when none are enabled. Per-template filtering happens via a `promptsOverride` callback on the loader, parallel to `skillsOverride` (already wired in `pi-session-manager.ts`'s `buildSkillsEnabledFilter`).
- `DefaultPackageManager.installAndPersist(source)` — install flow (no change).

## 4. Data model

### 4.1 Settings keys

No new keys. Prompts reuse the same `resourceEnabled: Record<resourceId, boolean>` map used by skills and extensions. The resource-id format is the same — `promptResourceId({source, relativePath})` — added to `src/shared/resource-id.ts` alongside the existing skill/extension helpers. Format suggestion: `"prompt:<source>:<relativePath>"` to disambiguate from skills which use `"skill:..."`.

### 4.2 No new SQL tables

Same as skills/extensions. State lives in `app_settings`.

## 5. UI

### 5.1 Mode rail

Add a `prompts` mode value alongside `chat`, `skills`, `extensions`. ModeRail gets a new entry; App.tsx routes `mode === "prompts"` to a new `PromptsMode` component.

### 5.2 PromptsMode layout

Three-pane shape identical to SkillsMode: list on the left, detail on the right, dialogs hosted at this level (install, import).

### 5.3 Prompts list rows

Each row shows:
- **Name** (primary, semibold)
- **Description** (secondary line, muted, truncated)
- **Argument hint** (if present, faint, prefixed `args:`)
- **Source** (in title attribute / tooltip, like skills)
- **Enable checkbox** (per-row, drives `resourceEnabled`)

Errors from `getPrompts().diagnostics` surface in a top-of-list banner, same pattern as skills.

### 5.4 Install dialog

Reuses `InstallSkillDialog` with `resourceKind="prompt"` already taken (extensions added `"extension"`; we add `"prompt"`). Dialog component is generic — just an input + progress.

### 5.5 Import from pi picker

Extend the existing `ImportFromPiDialog`'s `resourceKind` union with `"prompt"`. Backend `resources.listPiResources({kind:"prompt"})` walks `~/.pi/agent/prompts/` for top-level markdown files. Selective copy via `importSelectedPiPrompts` (parallel to `importSelectedPiSkills`).

### 5.6 Prompt detail view

- Header: name (read-only), description (editable text input), argumentHint (editable text input).
- Body: CodeMirror 6 Markdown editor.
- Save button writes the file back via `prompts.save`.
- Frontmatter strategy: pi's prompt loader reads the description + argument-hint from a YAML frontmatter block in the markdown file (we'll confirm against pi's loader). The editor edits the body; description and arg-hint are persisted to frontmatter on save. If the SDK turns out to read them from a sidecar JSON instead, we adjust.

### 5.7 Reload banner

The existing `SkillsChangedBanner` mechanism (window events `macpi:skills-changed` + `macpi:skills-changed-cleared`) already fires for *all* resource changes through extensions. Phase 3 adds matching events `macpi:prompts-changed` + `macpi:prompts-changed-cleared`, wired into the prompt-edit + import flows. ChatPane subscribes to all three.

## 6. Reload mechanism

Same as phase 1. `session.reload` IPC is generic; no change.

## 7. Import from `~/.pi`

`resources.listPiResources({kind:"prompt"})` mirrors the skill variant:
- Source dir: `~/.pi/agent/prompts/`
- Match: top-level markdown files only (subdirs ignored)
- `alreadyImported` = basename present in `<resourceRoot>/prompts/`

`resources.importPiResources({kind:"prompt", names})` copies the named files.

## 8. IPC contract additions

Mirror `skills.*` shapes:

```ts
"prompts.list": {
    req: Record<string, never>;
    res: {
        prompts: PromptSummary[];
        loadErrors: PromptLoadError[];
    };
};
"prompts.read": {
    req: { id: string };
    res: { manifest: PromptManifest; body: string };
};
"prompts.save": {
    req: { id: string; body: string; description?: string; argumentHint?: string };
    res: Record<string, never>;
};
"prompts.setEnabled": {
    req: { id: string; enabled: boolean };
    res: Record<string, never>;
};
"prompts.install": {
    req: { source: string };
    res: Record<string, never>;
};
```

Renderer-safe types in a new `src/shared/prompts-types.ts`:

```ts
export interface PromptSummary {
    id: string;
    name: string;
    description: string;
    argumentHint?: string;
    source: string;
    relativePath: string;
    enabled: boolean;
}

export interface PromptManifest {
    name: string;
    description: string;
    argumentHint?: string;
    source: string;
    relativePath: string;
    path: string;
}

export interface PromptLoadError {
    path: string;
    error: string;
}
```

Backed by a new `PromptsService` (parallel to `SkillsService` / `ExtensionsService`) wiring `loadPrompts → manager.loadPrompts()`.

## 9. Test strategy

### 9.1 Layer 1 — Unit

- `resource-id` test: `promptResourceId({source, relativePath})` round-trips.
- `friendlyNameForSource` already covers the source-string stripping.
- `pi-import` test: extend with prompt-kind cases (listing + selective copy from `~/.pi/agent/prompts/`).

### 9.2 Layer 2 — Integration

- `prompts-service.test.ts`: list → ids stable; setEnabled writes the right key; read returns body; save round-trips.
- `ipc-router.test.ts`: extend stubs for the new five methods.

### 9.3 Layer 3 — pi integration

Optional smoke that opening a session with a disabled prompt in `resourceEnabled` actually omits the template at run time. Cheap to add given the existing `buildPromptsEnabledFilter` shape.

## 10. Open implementation questions

- **Frontmatter format**: does pi expect `---` YAML frontmatter or a JSON sidecar for `description`/`argumentHint`? Implementer should confirm via pi's `prompt-templates.ts` parser before wiring `prompts.save` — the IPC schema is decided either way; only the on-disk format changes.
- **Prompts contributed by packages**: when an extension package contributes a prompt, the per-prompt `enabled` toggle still works (it's keyed on the resource id, not on the package). No special case needed.

## 11. Decision log delta

| ID | Decision | Rejected alternative |
|---|---|---|
| P3-D1 | Reuse phase 1 infrastructure verbatim | New parallel loader/repo for prompts (duplication for zero gain) |
| P3-D2 | List shows description + arg hint | Name-only (matches skills visually but loses key info) |
| P3-D3 | Markdown editor without preview tab | Add preview tab now (additive UX, not a blocker; ship without) |
| P3-D4 | Prompts get a third `resourceKind` in the import picker | Rely only on package imports (loses loose-file picker for prompts copied/edited by hand in `~/.pi/agent/prompts/`) |
| P3-D5 | Detail view edits description + arg-hint inline | Read-only fields (matches the editing scope of skills' detail view, which already allows full body edits) |
