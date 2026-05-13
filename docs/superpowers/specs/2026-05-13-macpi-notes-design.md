# macpi Notes Mode — Design Spec

**Date:** 2026-05-13
**Status:** Design — approved by user 2026-05-13, awaiting written-spec review.

---

## 1. Summary

A "sticky note"-style quick-capture surface inside macpi for ideas, bug-notes, and todos. Notes are persisted to a single human-readable markdown file at `~/.macpi/NOTES.md` so they can be reviewed and edited outside the app. A new top-level mode (📝) sits alongside Chat / Skills / Extensions / Prompts in the mode rail with the same list-pane + edit-pane layout.

## 2. Goals

- Capture a thought in 2 keystrokes (mode rail → click 📝 → start typing).
- Notes file is readable, hand-editable, version-controllable outside the app.
- File is always up-to-date — the user can open NOTES.md in another editor and see the latest state.
- Consistent UI patterns with the rest of macpi (same rail entry, list + detail layout).
- Survives external edits without silently losing user work.

## 3. Non-goals (v1)

- Search / filter / tags
- Manual drag-reorder
- Soft delete / archive
- Undo
- Live file watching (`fs.watch`)
- Markdown rendering inside the editor (raw markdown only)
- Keyboard shortcut for "new note from any mode"
- Note export / share
- Multi-file note libraries (one `NOTES.md` only)

Each of these is a coherent v2 add and easy to layer on top.

## 4. Architecture overview

Three layers:

1. **Main process** — `NotesService` owns disk I/O. Exposes list/read/save/create/delete via IPC. Pure parse/serialise helpers live in a separate module for unit testability.
2. **IPC** — Five new methods on `macpi:invoke`: `notes.list`, `notes.read`, `notes.save`, `notes.create`, `notes.delete`.
3. **Renderer** — `NotesMode` is the top-level container; `NotesList` is the left pane; `NoteEditor` is the right pane (plain `<textarea>` with debounced autosave). New mode-rail entry routes here.

Notes do **not** go in SQLite. The markdown file is the sole source of truth. This is deliberate: it's what makes "review outside the app" actually work.

## 5. NOTES.md storage contract

### File shape

```markdown
(optional preamble — anything before the first `## ` heading, preserved verbatim
on rewrite but never shown in the UI; lets the user add their own document
title, frontmatter, etc.)

## First note's title
Body markdown. Can contain:
- bullets
- ### sub-headings (anything below h2 is part of the body)
- ```code blocks```

## Second note's title
Body of the second note.
```

### Parse rules

- A **note begins** at every `^## ` line (h2 heading at column 0).
- A **note ends** at the next `^## ` line or end-of-file.
- The heading text (everything after `## ` on the line) is the note's **title**.
- Everything between the heading and the next note is the **body**.
- Content before the first `## ` heading is the **preamble**: parsed, retained in memory, written back verbatim on rewrite, never surfaced in the UI.
- `h3` (`### `) and deeper headings inside a note are part of the body and are not treated as note boundaries.
- A leading `# ` (h1) at the very start of the file is preamble (allows the user to title the document however they like).
- Line endings: tolerate both `LF` and `CRLF` on read; always write `LF`.
- Trailing whitespace on heading lines is stripped on read.
- Notes with an empty title AND empty body are not persisted (i.e. an unmodified "new note" the user never typed in disappears on save).

### Title round-trip semantics (the tricky bit)

In the UI, a note is a single text blob (one `<textarea>`). The user types whatever they want. The parser/serialiser converts between blob and `## heading + body` form.

**Serialise rules (blob → file form):**

1. Trim leading blank lines from the blob.
2. The **first non-empty line** of the blob is the title. The remainder (everything after the first newline) is the body.
3. If the first non-empty line already starts with `## `, strip the leading `## ` before using as title (avoids `## ## thing` on round-trip when the user types their own h2).
4. Emit `## <title>\n<body>\n` followed by a blank line.

**Parse rules (file form → blob):**

1. Strip the leading `## ` from the heading line.
2. Concatenate heading + body (separated by `\n`) into a single blob.
3. The blob in the editor is the heading-text + newline + body-content. The user can edit the title by editing the first line.

This is lossless for the common case (user types "Title\nbody text"). It's also lossless if the user manually types `## something` as their first line — the serialiser drops the prefix on save, the parser puts it back implicitly on next load.

The blob in memory is what the editor displays; the file form is what's persisted. The two are different representations of the same content.

### Empty file / first run

If `~/.macpi/NOTES.md` does not exist when the user first enters notes mode, create it with empty content (zero bytes). No notes exist. The "+ New note" button is the only thing visible.

## 6. Note identity

Each in-memory note carries an `id: string` (UUID assigned on read). The file format has no IDs — just `## title` headings.

- On every read, all notes get fresh UUIDs.
- Within a session, IDs are stable and used as React keys and IPC payload identifiers.
- On every save, the **whole file is rewritten** from the in-memory list. IDs are discarded; new ones get assigned on the next read.
- Note order in the file mirrors the order in the list pane (most recently edited first).

This keeps the contract simple: in-memory IDs for the UI's needs, the file for persistence and external review. No hidden ID columns leaking into the markdown.

## 7. External edit handling

The user explicitly wants to review (and may edit) NOTES.md outside macpi. The interaction model is "edit in one place at a time, refresh when switching."

### Guards

1. **mtime tracking.** Every `notes.list` and `notes.read` records `lastReadMtime` for NOTES.md. Stored in `NotesService` state.
2. **Pre-write check.** Every `notes.save` and `notes.delete` calls `fs.stat` first. If the current mtime ≠ `lastReadMtime`, the IPC returns `{ error: "stale", currentMtime }` instead of writing.
3. **Renderer reaction.** The editor shows a small inline banner: *"NOTES.md changed on disk. [Reload] or [Overwrite]?"* — Reload re-issues `notes.list` and discards in-flight edits; Overwrite calls a second IPC variant (`notes.save` with `{force: true}`) that bypasses the mtime check.
4. **Manual refresh.** A small ↻ button in the list pane header issues `notes.list` unconditionally.
5. **No file watcher.** `fs.watch` is unreliable on macOS, especially across iCloud Drive and similar synced directories. The mtime-on-save check is sufficient because writes are the only operation that can clobber.

## 8. Save model

Edits autosave to disk 500ms after the last keystroke. Implementation:

- `NoteEditor` keeps `draft: string` in React state, `useEffect` watches `draft` with a debounced effect.
- When the debounce fires, the renderer issues `notes.save({id, blob})`.
- The main process serialises the full list (with the updated note replacing its previous entry), pre-write-checks mtime, writes, updates `lastReadMtime`.
- On error, ErrorBanner pattern (same as other services).

No "Save" button. No "Unsaved" indicator (writes are too frequent for it to be meaningful).

## 9. IPC surface

```ts
// shared/ipc-types.ts additions

"notes.list": {
  req: {};
  res: { notes: NoteSummary[]; preamble: string; mtime: number };
};
"notes.read": {
  req: { id: string };
  res: { id: string; title: string; body: string; blob: string };
};
"notes.save": {
  req: { id: string; blob: string; force?: boolean };
  res: { ok: true; mtime: number } | { ok: false; error: "stale"; currentMtime: number };
};
"notes.create": {
  req: {};
  res: { id: string };
};
"notes.delete": {
  req: { id: string; force?: boolean };
  res: { ok: true; mtime: number } | { ok: false; error: "stale"; currentMtime: number };
};
```

### Types

```ts
// shared/notes-types.ts

export interface NoteSummary {
  id: string;
  title: string;
  bodyPreview: string;  // first ~120 chars of body for the list pane subtitle
  mtime: number;        // file mtime at last read; same value for every note in a snapshot
}

export interface NoteDetail {
  id: string;
  title: string;
  body: string;
  blob: string;         // title + "\n" + body — what the editor renders
}
```

The renderer never sees the file mtime per-note (it's the same value for all notes in one read snapshot). One `mtime` on the list response lets the renderer detect "stale" responses if multiple `notes.list` calls overlap.

## 10. Data flow

| User action | Sequence |
|---|---|
| Open notes mode | `useNotes()` → `notes.list` → parse NOTES.md → render |
| Select note | `useNoteDetail(id)` → `notes.read` → editor renders blob |
| Type in editor | local state update, 500ms debounce, `notes.save` → file rewrite |
| Click "+ New note" | `notes.create` returns new ID; renderer prepends an empty note to the list; selects it; editor opens; first keystroke triggers autosave |
| Click 🗑 | confirm dialog → `notes.delete` → file rewrite → list invalidates |
| Click ↻ Refresh | `notes.list` (force re-read) → renderer re-renders list |
| External edit detected | next save returns `{error:"stale"}` → editor shows banner with Reload / Overwrite |

## 11. Components & file structure

| Action | Path | Purpose |
|---|---|---|
| Create | `src/main/notes-parser.ts` | Pure parse + serialise. Heavy on tests. ~120 LOC. |
| Create | `src/main/notes-service.ts` | Owns NOTES.md, mtime tracking, list/read/save/create/delete. ~180 LOC. |
| Create | `src/shared/notes-types.ts` | `NoteSummary`, `NoteDetail`. ~30 LOC. |
| Modify | `src/shared/ipc-types.ts` | Five new method entries. |
| Modify | `src/main/ipc-router.ts` | Wire NotesService. ~30 LOC added. |
| Modify | `src/main/index.ts` | Instantiate NotesService, pass to router. |
| Create | `src/renderer/components/NotesMode.tsx` | Top-level mode container. ~50 LOC. |
| Create | `src/renderer/components/NotesList.tsx` | List pane with hover-trash, ↻ refresh. ~100 LOC. |
| Create | `src/renderer/components/NoteEditor.tsx` | `<textarea>` + autosave + stale-mtime banner. ~110 LOC. |
| Modify | `src/renderer/components/ModeRail.tsx` | Add 📝 entry. |
| Modify | `src/renderer/queries.ts` | `useNotes`, `useNoteDetail`, `useSaveNote`, `useCreateNote`, `useDeleteNote`. |
| Modify | `src/renderer/App.tsx` | Route `mode === "notes"` to `NotesMode`. |
| Create | `tests/unit/notes-parser.test.ts` | ~12 cases: empty file, preamble, single note, many notes, sub-headings, frontmatter preservation, CRLF, round-trips. |
| Create | `tests/integration/notes-service.test.ts` | ~5 cases: list-read-save-delete cycle, stale-mtime detection, force-overwrite, create-then-save flow, first-run file creation. |

Approximate total: ~600 LOC of new code (parser + service + 3 renderer components + tests). Comparable to the Prompts mode build.

## 12. Error handling

- **NOTES.md missing on first read** → create as empty file. Zero notes. No error surfaced.
- **NOTES.md is binary / unparseable** → unlikely with our liberal parser, but if `parseNotesMd` throws, surface a load-error pane (similar to extensions' loadErrors). User can edit NOTES.md externally to fix.
- **Stale mtime on save/delete** → return structured error to renderer; renderer shows the Reload/Overwrite banner. Never silently overwrite.
- **Disk full / permission denied** → ErrorBanner pattern, same as other services. The in-memory draft is preserved so the user doesn't lose their text.

## 13. Testing strategy

### Layer 1 — Unit (Vitest)

`tests/unit/notes-parser.test.ts`:
- Empty file → zero notes, empty preamble
- Preamble-only file → zero notes, preamble preserved
- Single note (heading + body) → one note, correct title and body
- Single note with no body → one note, empty body
- Multiple notes → correct order, correct boundaries
- Sub-heading inside body → not treated as new note
- `## ` inside a fenced code block → currently still treated as new note (documented limitation; sub-heading in body is fine, but `## ` at column 0 inside a code block is a known edge case the parser doesn't try to detect)
- Frontmatter / preamble round-trip → preserved verbatim
- CRLF input → parses identically to LF; output is always LF
- Empty note (no title, no body) → dropped on serialise
- User types `## thing` as first line → title becomes `thing`, no double `## ` on round-trip

### Layer 2 — Integration (Vitest, real disk via tmpdir)

`tests/integration/notes-service.test.ts`:
- Round trip: create-save-read produces what was written
- First-run: missing NOTES.md is created as empty
- Stale detection: bump the file mtime externally between read and save → save returns `{error:"stale"}`
- Force-overwrite: `notes.save({force:true})` after a stale detection succeeds
- Delete: removes the right section; preamble preserved
- mtime tracking: lastReadMtime updates after each successful save
- UUIDs: stable within a session, regenerated on each fresh read

### Layer 3 — Renderer tests

None. Consistent with the rest of macpi (renderer tests deferred to the Playwright Electron layer that hasn't shipped).

## 14. UI details

### Mode rail entry

- Icon: 📝
- Position: after 📜 Prompts
- Label: "Notes"
- Tooltip: "Notes — quick capture, stored in ~/.macpi/NOTES.md"

### List pane

- Header: "Notes" (uppercase letterspace, matches other modes), `↻` refresh button, `+ New` button.
- Each row: title (one line, truncated), body preview (one line of body, ~80 chars, muted), trash icon visible on hover.
- Selection: row click selects; selected row gets `surface-row` background.
- Empty state: "No notes yet. + New note to begin."

### Editor pane

- Header: shows the title preview only (read-only label — title is edited in the textarea itself, this header is for visual anchoring).
- Body: full-height `<textarea>` using `var(--font-body)` (notes are prose, not code; mono would feel like an editor and undercut the sticky-note tone). Inline `\`\`\`` code blocks are not rendered — the editor shows raw markdown throughout.
- Autosave: silent. No "Saving…" indicator. No "Unsaved" badge.
- Stale-mtime banner: appears at the top of the editor only when stale detected. Disappears on Reload or Overwrite.
- Empty state (no note selected): "Select a note or create a new one."

### Trash confirm

Reuses `ConfirmDialog` component. "Delete this note?" / "Cancel" / "Delete". No undo path.

## 15. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Single file, not directory | "A markdown file" — user's words. One file is easier to review/sync/version. |
| D2 | `## ` as note delimiter | Matches markdown reading conventions; supports `#` preamble and `###+` body sub-headings. |
| D3 | First line of blob = title | Matches Apple Notes / iA Writer pattern. Lowest capture friction. |
| D4 | Plain `<textarea>`, not CodeEditor | Sticky-note aesthetic. Skills/Prompts use CodeEditor; this is intentionally lower ceremony. |
| D5 | Autosave 500ms debounce | "Review outside the app" requires the file to always be current. |
| D6 | mtime check on save, not file watcher | `fs.watch` is unreliable on macOS / iCloud. mtime catches the only thing that matters: writes. |
| D7 | UUIDs per session, regenerated on read | Avoids leaking IDs into the markdown file. |
| D8 | Most-recently-edited at top | Sticky-note metaphor: fresh stuff on top of the pile. |
| D9 | Trash icon + confirm dialog | Standard pattern, discoverable, low risk. |
| D10 | No SQLite | File is sole source of truth. Database persistence would create a second copy that has to stay in sync. |

## 16. Open items / future work (out of scope for v1)

- **Search** — once you have >50 notes, a Cmd-F filter would help.
- **Tags** — frontmatter-based (`tags: [bug, ui]`), filter chips in list pane.
- **Quick capture shortcut** — global Cmd-Shift-N opens a small popover from any mode.
- **Markdown render preview** — toggle between raw and rendered view in the editor.
- **Drag reorder** — manual sort order.
- **Soft delete** — `## Archived` section at the end of the file.
- **Sync** — Obsidian-vault interop via configurable file location (already half-supported by `resourceRoot`).

## 17. Glossary

- **Blob** — the single string that the editor's `<textarea>` displays. Equivalent to the concatenation of a note's title + body, separated by `\n`.
- **Preamble** — any content in NOTES.md before the first `## ` heading. Preserved on rewrite, never shown in the UI.
- **Stale mtime** — the file's modification time on disk differs from what `NotesService` recorded at last read, indicating an external edit.
