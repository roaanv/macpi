# File Browser Pane — Design

**Status:** shipped
**Author:** macpi
**Date:** 2026-05-16

## 1. Summary

Add a right-side resizable, collapsible pane to chat mode that browses the
current pi session's working directory. The pane is split top/bottom: the
top half renders a lazily-expanded file tree; the bottom half renders the
selected file's content. Only "text" files are previewable; markdown files
render via the existing `MarkdownText` component, everything else as
monospace `<pre>`.

The pane is hidden by default and toggled via an icon button on the chat
header. Pane visibility, width, and tree/preview split height persist via
localStorage. Tree contents refresh after every pi `session.turn_end` so
files pi writes mid-conversation surface without manual refresh.

## 2. User-visible behaviour

### Where it lives

A new right-anchored `ResizablePane` appears in chat mode after `ChatPane`.
The drag handle is on the **left** edge of the pane (mirror of the existing
channels pane). Min 240px / max 720px.

### Toggle

A folder icon button on `ChatPane`'s top-right toggles the pane open/closed.
State persists as `macpi:pane-open:files` in localStorage. Default closed.

### Top sub-pane: file tree

- **Root**: the active session's `cwd` (read from `channelSessions.getMeta`).
- **Lazy expand**: each folder shows a `▸` toggle. Clicking expands it and
  triggers `files.listDir({path, showHidden})` for the first time. Subsequent
  expand/collapse uses cached data; per-folder cache invalidation happens on
  pi `turn_end`.
- **Default-hidden noise**: a hard-coded `IGNORED_NAMES` set (see §3.2)
  filters dotfiles and common build-output folders. A "Show hidden" toggle
  in the pane header un-hides them.
- **Non-text files**: appear in the tree at 50% opacity, are not selectable.
- **Selection**: clicking a text file row highlights it (active row treatment
  matches the channel sidebar) and loads its content into the preview.

### Bottom sub-pane: preview

- **Split**: horizontal drag handle between tree and preview; persisted as
  `macpi:pane-height:files-tree` (default 50/50 split).
- **Empty state**: "Select a file to preview."
- **Markdown** (`.md`, `.markdown`): rendered via existing `MarkdownText`.
- **Other text**: rendered as a `<pre>` with `font-family: var(--font-mono)`,
  horizontal scroll, line-wrap off. Tab characters become 4-space soft tabs
  visually (CSS `tab-size: 4`).
- **Too large**: files > 1 MB show "File too large to preview (`{size}`
  bytes; cap 1 MB)" and do not call `readText`.
- **Permission denied / missing**: see §5.

### Empty states

| Condition | Message |
|---|---|
| No session selected | "Select a session to browse its files." |
| Session has no cwd | "This session has no working directory." |
| Session cwd doesn't exist | "Directory missing: `{path}`" |
| No file selected (with cwd ok) | "Select a file to preview." |

### Refresh

Tree and preview share a `useInvalidateOnTurnEnd(piSessionId, ...)`
subscription. On `session.turn_end` or `session.compaction_end`:
- All `files.listDir` query keys for the active root are invalidated.
- The currently-selected file's `files.readText` query is invalidated.

A small refresh icon in the pane header invalidates the same query keys
manually.

## 3. Architecture

### 3.1 Layout

```
ChatPane (header: + folder-toggle, + ChatBreadcrumb)
  ├── Timeline / Composer / Banners (existing)
  ├── ChatFooter (existing)
  ├── ChatContextBar (existing)
  └── [if filesOpen] FileBrowserPane (right-anchored)
       ├── header (root path label, refresh, show-hidden, close)
       ├── (vertical split, draggable)
       ├── FileTree (top)
       └── FilePreview (bottom)
```

### 3.2 New shared helpers (`src/shared/text-files.ts`)

```ts
export const TEXT_EXTENSIONS: ReadonlySet<string>;
// .txt .md .markdown .json .jsonc .yaml .yml .toml .csv .tsv .log
// .ts .tsx .js .jsx .mjs .cjs .py .rs .go .rb .java .kt .swift
// .c .cpp .h .hpp .sh .bash .zsh .sql .css .scss .html .htm .xml
// .gitignore .env .editorconfig

export const TEXT_FILENAMES: ReadonlySet<string>;
// Files-without-extensions that are always text:
// Dockerfile Makefile LICENSE README CHANGELOG NOTICE

export const IGNORED_NAMES: ReadonlySet<string>;
// node_modules .git .DS_Store .next dist build out .vite .turbo
// .cache .nuxt .svelte-kit .parcel-cache .pytest_cache __pycache__
// Note: this is a *names* set; matched only at any depth where the
// name appears as-is (no globbing).

export function isTextPath(name: string): boolean;
// Lowercases the extension, checks both TEXT_EXTENSIONS and TEXT_FILENAMES.
// Also true for dotfile-extensions when name starts with "." (e.g. .env.local).

export function isMarkdownPath(name: string): boolean;
// True for .md, .markdown (case-insensitive).

export function shouldHide(name: string, showHidden: boolean): boolean;
// True if (name starts with "." || IGNORED_NAMES.has(name)) && !showHidden.
```

The 1 MB cap is a constant in `files-service.ts`, not exported from this
shared module.

### 3.3 New main module (`src/main/files-service.ts`)

Pure-fs walker, no DB. One required dep: a `getSessionCwd(piSessionId)`
function the router passes in (so the service stays unit-testable without
the channels repo).

```ts
export interface FileEntry {
  name: string;          // basename, no slashes
  path: string;          // absolute
  kind: "file" | "dir";
  isText: boolean;       // false for dirs and non-allowlisted files
  sizeBytes: number;     // for files; 0 for dirs
}

export interface ListDirResult {
  entries: FileEntry[];  // dirs first (sorted alpha), then files (sorted alpha)
}

export interface ReadTextResult {
  content: string;
  sizeBytes: number;
  truncated: false;      // reserved — we never truncate; we reject
}

export class FilesService {
  constructor(deps: { getSessionCwd: (sid: string) => string | null });
  listDir(piSessionId, relPath, showHidden): Promise<ListDirResult>;
  readText(piSessionId, relPath): Promise<ReadTextResult>;
}
```

**Path traversal guard** (applied in every call):
1. `cwd = getSessionCwd(piSessionId)` — reject if null.
2. `cwdReal = await fs.promises.realpath(cwd)` — resolve the cwd itself
   once so trailing-separator and platform-symlink quirks (e.g. macOS
   `/tmp` → `/private/tmp`) can't bypass the check.
3. `abs = path.resolve(cwdReal, relPath)` (or `cwdReal` directly if
   `relPath === ""`).
4. `real = await fs.promises.realpath(abs)` (resolves any symlinks under
   the cwd).
5. If `real !== cwdReal && !real.startsWith(cwdReal + path.sep)` → throw
   `path_outside_cwd`.
6. For `readText`: stat the file; if `size > 1_048_576` → throw `too_large`;
   if `!isTextPath(basename)` → throw `binary`. (Defense-in-depth — the
   UI already hides these, but the backend rejects too.)

### 3.4 IPC contract (`src/shared/ipc-types.ts`)

```ts
"files.listDir": {
  req: { piSessionId: string; path: string; showHidden: boolean };
  res: { entries: FileEntry[] };
};
"files.readText": {
  req: { piSessionId: string; path: string };
  res: { content: string; sizeBytes: number };
};
```

`path` is **relative** to the session cwd. Empty string means the cwd
itself. The service joins, resolves, and validates; the renderer never
constructs absolute paths.

Error codes returned: `no_cwd`, `not_found`, `path_outside_cwd`, `binary`,
`too_large`, `permission_denied`.

### 3.5 Renderer hooks (`src/renderer/queries.ts`)

```ts
export function useDirListing(
  piSessionId: string | null,
  relPath: string,
  showHidden: boolean,
);
// queryKey: ["files.listDir", piSessionId, relPath, showHidden]
// staleTime: Number.POSITIVE_INFINITY; disabled when piSessionId is null.

export function useFileContent(
  piSessionId: string | null,
  relPath: string | null,
);
// queryKey: ["files.readText", piSessionId, relPath]
// staleTime: Number.POSITIVE_INFINITY; disabled when either is null.
```

Refresh wiring lives in `FileBrowserPane` via `useInvalidateOnTurnEnd`
(already exists from the prior PR), invalidating both query prefixes.

### 3.6 ResizablePane change

Add a single optional prop:

```ts
side?: "left" | "right";   // default "right" (existing behaviour)
```

When `side="left"`, the handle is positioned `left-0` instead of `right-0`,
and the drag delta inverts (`x - startX` → `startX - x`). All other
behaviour identical.

### 3.7 New renderer components

- `FileBrowserPane.tsx` — owns: `selectedPath: string | null`,
  `showHidden: boolean`, `expandedPaths: Set<string>` (the lifted tree
  expansion state), and the vertical split height (persisted). Renders
  header + tree + preview. Uses `useInvalidateOnTurnEnd`.
- `FileTree.tsx` — recursive, purely controlled. Props: `piSessionId`,
  `relPath`, `depth`, `showHidden`, `expandedPaths`, `selectedPath`,
  `onToggleExpand(relPath)`, `onSelect(relPath)`. Each row: `▸/▾` toggle,
  kind icon, name. Non-text files at 50% opacity. Lifting expansion to
  the pane lets refresh re-render without losing which folders were open.
- `FilePreview.tsx` — props: `piSessionId`, `selectedPath`, `sizeBytes`.
  If `sizeBytes > 1_048_576` short-circuits to "too large" without
  calling `readText`. Otherwise switches on `isMarkdownPath(selectedPath)`.

## 4. Data flow

```
ChatPane.filesOpen (localStorage)
  ↓
FileBrowserPane(piSessionId, sessionCwd)
  ├─ header: [refresh] [show-hidden toggle] [close]
  ├─ useInvalidateOnTurnEnd → ["files.listDir", piSessionId, ...]
  │                            ["files.readText", piSessionId, ...]
  ├─ FileTree(relPath="")
  │   └─ for each entry:
  │       if entry.kind === "dir":
  │         show toggle; if expanded, recurse into FileTree(entry.relPath)
  │       else if entry.isText:
  │         show row; onClick → setSelectedPath(entry.relPath)
  │       else:
  │         show row at 50% opacity, not selectable
  └─ FilePreview(selectedPath)
      useFileContent(piSessionId, selectedPath)
        ├ md → <MarkdownText text={content} />
        ├ other → <pre>{content}</pre>
        ├ too_large → "File too large…"
        └ error → inline message
```

## 5. Error handling

| Failure | UI |
|---|---|
| `files.listDir` `no_cwd` | "This session has no working directory." (pane-level) |
| `files.listDir` `not_found` | Tree node shows "(missing)"; expansion collapses |
| `files.listDir` `path_outside_cwd` | Inline "blocked" badge; logged via `mainLogger.warn` |
| `files.listDir` `permission_denied` | Inline "(no permission)" on the row, expansion collapses |
| `files.readText` `too_large` | Preview: "File too large to preview ({size} bytes; cap 1 MB)" |
| `files.readText` `binary` | Preview: "Binary file — preview is text-only." (defensive; UI already filters) |
| `files.readText` `not_found` | Preview: "File missing. It may have been deleted." |
| `files.readText` `permission_denied` | Preview: "Permission denied." |

All preview errors clear when the user selects a different file. Tree row
errors clear on next successful `listDir` for that path (e.g. after refresh).

## 6. Testing

### Unit (`tests/unit/text-files.test.ts`)

- `isTextPath`: `.md`, `.json`, `.ts`, `.gitignore`, `.env.local`,
  `Dockerfile`, `LICENSE` → true; `.png`, `.zip`, `.so`, `.woff2` → false.
- `isMarkdownPath`: `.md`, `.MD`, `.markdown` → true; `.txt`, `.json` → false.
- `shouldHide("node_modules", false)` → true; with `true` → false.
- `shouldHide(".git", false)` → true; `shouldHide("README.md", false)` → false.

### Unit (`tests/unit/files-service.test.ts`) — uses `tmp` + real fs

Fixture: `tmp/file-browser-test-<rand>/` populated with:
```
src/
  app.ts
  index.html
node_modules/
  .package-lock.json
.git/
  HEAD
README.md            (text, ~100 B)
big.txt              (text, 2 MB — generated)
binary.bin           (random bytes, 256 B)
```

Tests:
- `listDir("", false)` → returns `src/`, `README.md` only (sorted; dirs first).
- `listDir("", true)` → also includes `node_modules`, `.git`.
- `listDir("../..", false)` → throws `path_outside_cwd`.
- `listDir("/etc", false)` → throws `path_outside_cwd`.
- Symlink `tmp/escape -> /tmp` then `listDir("escape", false)` → throws
  `path_outside_cwd` (realpath catches it).
- `listDir(".", false).entries.find(e => e.name === "src")` has `kind="dir"`,
  `isText=false`.
- `listDir("src", false).entries.find(e => e.name === "app.ts")` has
  `isText=true`.
- `readText("README.md")` → returns the file content, `sizeBytes` matches.
- `readText("big.txt")` → throws `too_large`.
- `readText("binary.bin")` → throws `binary`.
- `readText("../escape.txt")` → throws `path_outside_cwd`.
- `getSessionCwd` returns null → all calls throw `no_cwd`.

### Integration (deferred)

No new pi-integration test. Manual smoke test (documented):
1. Open chat with a real session pointed at `~/code/macpi`.
2. Toggle the file pane open. Verify root entries match `ls -lA`
   (modulo hidden filtering).
3. Expand `src/renderer/components/`. Verify `.tsx` files appear, `.png`
   files (if any) appear dimmed.
4. Click `ChatFooter.tsx` → verify monospace preview, content matches disk.
5. Click `docs/superpowers/specs/2026-05-16-file-browser-pane-design.md` →
   verify markdown renders (headings, code fences).
6. In the chat, ask pi to create `tmp.md` in the cwd. After pi's turn ends,
   verify `tmp.md` appears in the tree without manual refresh.
7. Resize the pane; close; reopen; reload the app — verify width and
   open/closed state survive.
8. Switch to a different session — verify the tree re-roots and the
   previously-selected path clears.

## 7. Non-goals (deferred)

- **Editing**. Read-only preview only. File-edit is pi's job (or `code .`).
- **Search**. No filename or content search inside the pane. Pi's grep is
  the path.
- **File-system watcher**. `fs.watch`/chokidar would catch out-of-band
  edits (e.g. another editor saving a file) but adds a long-lived watcher
  per session. Defer until users complain.
- **Drag-and-drop**. Can't drag files into chat from this pane in v1.
- **Image preview**. Even if extension passes, images are non-text. Defer.
- **Per-extension syntax highlighting** for non-md files. Plain mono in v1.
- **Tree state persistence across sessions**. Expanded folders and
  selection reset on session change. (Stays in-memory per session.)

## 8. Dependencies

No new npm packages. Uses `react-markdown` + `remark-gfm` (already
installed via `MarkdownText`), `@tanstack/react-query` (already in use),
`node:fs/promises` + `node:path` (Node built-ins).

## 9. Implementation

Implemented per `docs/superpowers/plans/2026-05-16-macpi-file-browser-pane.md`.

Spec adjustments during implementation:
- `FileEntry.kind` reduced to `"file" | "dir"` (symlinks are realpath-resolved
  to their target's kind; the literal `"symlink"` is unreachable).
- `FileEntry` exposes `relPath` rather than absolute `path` — the renderer
  never constructs or sees absolute paths.
- `FilesService.resolveSafe` runs a lexical pre-check (`path.resolve` + cwd
  prefix) BEFORE the realpath check, so escape attempts to non-existent
  targets report `path_outside_cwd` rather than leaking through as
  `not_found`. The realpath check is retained as belt-and-braces for the
  symlink-escape case where the lexical path looks clean.
- IPC unknown-error fallback in the `files.*` handlers reuses the existing
  `"exception"` code (matches the router's top-level catch convention).

Manual smoke per §6 is deferred to user testing on macOS — automated tests
cover the FilesService guard semantics (16 cases) and shared classification
helpers (14 cases); the renderer chain is verified by end-to-end visual
testing.
