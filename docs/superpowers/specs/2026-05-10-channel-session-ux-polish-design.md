# Channel / Session UX Polish — Design Spec

**Date:** 2026-05-10
**Status:** Approved (pending user spec review)
**Builds on:** `2026-05-09-macpi-pi-dev-ui-design.md` §6 (Data model), §7 (App shell — three-pane), §8 (Chat pane).

## 1. Summary

Promote the channel/session sidebar from "barely usable" to "daily-driver" by adding rename/delete affordances, a real cwd picker, human-readable session labels, a chat-header breadcrumb, and auto-focus on creation. No new architectural layers; everything rides on the existing IPC + repo + TanStack Query pattern.

## 2. Goals

1. User can rename and delete channels (with cascade-confirm if non-empty).
2. User can choose the cwd when creating a session, defaulting to a configurable global cwd.
3. Sessions display a human label (auto-derived from cwd basename + first user message), user-editable.
4. User can delete a session row from the sidebar (DB only; pi's `~/.pi/agent/sessions/<id>.jsonl` is preserved).
5. Chat header shows a single-line breadcrumb: `# channel › label · /full/cwd · sess-abc12345`.
6. Newly created channels and sessions are automatically selected in the sidebar.

## 3. Non-goals

- Settings UI itself (only the IPC stub for `settings.getDefaultCwd`).
- Reordering / drag-and-drop of channels or sessions.
- Filtering / search.
- Deleting pi's persisted session file from disk (preserves recoverability).
- Multi-select / bulk operations.

## 4. Architecture

No new layers. All changes ride on existing patterns:

- **DB:** one new migration `0003-session_labels.sql` adding `label` + `label_user_set` columns to `channel_sessions`.
- **Main:** seven new IPC methods (`channels.rename`, `channels.delete`, `session.rename`, `session.delete`, `session.setFirstMessageLabel`, `dialog.openFolder`, `settings.getDefaultCwd`). Repos get matching mutating methods. New `dialog-handlers.ts` wraps `electron.dialog.showOpenDialog`.
- **Renderer:** sidebar gets hover-revealed `⋮` menus; chat header gets a `BreadcrumbBar`; new `NewSessionForm` replaces the bare button. Auto-focus via mutation `onSuccess` callbacks.

## 5. Data model

### 5.1 Migration `0003-session_labels.sql`

```sql
ALTER TABLE channel_sessions ADD COLUMN label TEXT;
ALTER TABLE channel_sessions ADD COLUMN label_user_set INTEGER NOT NULL DEFAULT 0;
```

- `label` may be `NULL`. Renderer falls back to `cwd` basename, then short-id, then `"(unlabeled)"`.
- `label_user_set = 1` means the user has explicitly named the session; auto-label-on-first-message must not overwrite it.

### 5.2 Settings (stub)

No table yet. `settings.getDefaultCwd` returns `os.homedir()` from a single `default-cwd.ts` module. Future settings UI replaces the implementation with a DB read; the IPC contract does not change.

### 5.3 Existing tables

- `channels(id, name, position, icon, created_at)` — already exists. Adds rename + delete operations.
- `channel_sessions(channel_id, pi_session_id, created_at, cwd, session_file_path, label, label_user_set)` — extended with new columns.

## 6. Component changes

| Component | Change |
|---|---|
| `ChannelSidebar.tsx` | Per-channel hover-revealed `⋮` (Rename, Delete). Inline rename input. Per-session hover-revealed `⋮` (Rename, Delete). Replace `+ new session` button with `<NewSessionForm />`. Auto-focus on channel/session create. |
| `ChatPane.tsx` | Replace the bare `session {id}` line with `<BreadcrumbBar />`. Read session metadata via existing `useAttachSession`'s response, extended to include label + cwd. |
| `NewSessionForm.tsx` *(new)* | Inline form with cwd text input + 📁 button + Create. Default cwd from `settings.getDefaultCwd`. |
| `BreadcrumbBar.tsx` *(new)* | Pure-render breadcrumb: `# channel › label · /cwd · sess-abc12345`. |
| `RowMenu.tsx` *(new)* | Reusable hover-revealed `⋮` button with popover menu. Opens on click; closes on outside-click or Escape. |
| (inline rename, no new component) | On Rename click, replace the row's label with an `<input>` in place; commit on Enter/blur, cancel on Escape. |
| `ConfirmDialog.tsx` *(new)* | Custom-styled confirm modal for destructive actions. Used for non-empty channel delete and session delete. |

## 7. IPC methods

```ts
"channels.rename":     { req: {id, name}, res: Record<string, never> }
"channels.delete":     { req: {id, force?: boolean}, res: Record<string, never> }
"session.rename":      { req: {piSessionId, label: string}, res: Record<string, never> }
"session.delete":      { req: {piSessionId}, res: Record<string, never> }
"session.setFirstMessageLabel": { req: {piSessionId, text: string}, res: {applied: boolean} }
"dialog.openFolder":   { req: {defaultPath?: string}, res: {path: string | null} }
"settings.getDefaultCwd": { req: Record<string, never>, res: {cwd: string} }
```

`channels.rename` already exists in the codebase; we keep it. `channels.delete` already exists but currently has no force semantics — we extend it.

### 7.1 Cascade-delete contract

`channels.delete({id})` (no `force`):
- If channel has 0 sessions → delete it, return `ok({})`.
- If channel has ≥1 session → return `err("non_empty", "<N> sessions")`.

`channels.delete({id, force: true})`:
- Always cascades: deletes all `channel_sessions` rows for the channel, then the channel itself.
- Disposes any active `PiSessionManager` sessions for those `piSessionId`s.

The renderer catches `non_empty` and shows a confirm modal: *"Channel `# foo` has N sessions. Delete the channel and all its sessions?"* — on confirm, retries with `force: true`. (Pi's session files on disk are not touched.)

### 7.2 Session label IPC

`session.setFirstMessageLabel({piSessionId, text})`:
- If `label_user_set = 1` → return `{applied: false}`. No-op.
- Else → set `label = "<basename>: <ellipsize(text, 40)>"` (where `basename` is derived from `cwd`), `label_user_set` stays 0. Return `{applied: true}`.

Idempotent: subsequent calls with `label_user_set = 0` overwrite, but the renderer only calls this once per session (gated by client-side state), so in practice it fires once.

`session.rename({piSessionId, label})`:
- Empty string → `label = NULL`, `label_user_set = 0` (clears user override).
- Non-empty → `label = text`, `label_user_set = 1`.

### 7.3 Folder picker

`dialog.openFolder({defaultPath?})`:
- Main calls `dialog.showOpenDialog({properties: ['openDirectory'], defaultPath})`.
- Returns `{path: string}` on selection, `{path: null}` on cancel.

## 8. Auto-label flow

```
user types first message and hits send
    ↓
appendUserMessage(text) in useTimeline       (renderer, before IPC)
    ↓
detect: snapshot.timeline had no user entries before this one
    ↓
dispatch session.setFirstMessageLabel({piSessionId, text})    (fire-and-forget)
    ↓
main: repo updates label if label_user_set = 0
    ↓
renderer: queries.invalidate(["session.attach", piSessionId]) on success
    ↓
breadcrumb + sidebar re-render with new label
```

The detection (`first user message`) lives in the renderer because `appendUserMessage` is the canonical first-message moment and avoids races with pi event ordering.

## 9. Auto-focus flow

- `useCreateChannel`: extend `onSuccess` to call a passed-in `onSelect(id)` callback in addition to the existing `invalidateQueries`. Sidebar passes its `onSelectChannel` prop.
- `useCreateSession`: extend `onSuccess` to call `onSelectSession(piSessionId)`. Sidebar passes its `onSelectSession` prop.

Mutations stay generic (no required callback) — both hooks accept an optional `onCreated` argument to keep callsites minimal.

## 10. Error handling

| Scenario | Behavior |
|---|---|
| Folder picker cancelled | `path: null` → no-op in form, keep prior input. |
| `channels.delete` returns `non_empty` | Renderer shows `<ConfirmDialog />` with session count; on accept → retry with `force: true`. |
| `session.rename` with empty label | Repo treats empty string as `NULL` (label cleared, falls back to default rendering). |
| `session.delete` while session is the active selection | Renderer clears `selectedSessionId` so `ChatPane` shows the empty-state. |
| `channels.delete` while a session in that channel is active | Same — clear active selection. |
| Concurrent `setFirstMessageLabel` (rare) | DB update is atomic; second caller is a no-op (`label_user_set` already changed by the rename, OR `label` already populated and equal). |

## 11. Testing strategy

### L1 — unit (pure)

- `tests/unit/label.test.ts`:
  - `computeSessionLabel(meta)` returns label, basename, or short-id in priority order.
  - `formatFirstMessageLabel(basename, text)` → `"basename: <truncated>"`, max 40 chars, ellipsis.

### L2 — integration

- `tests/integration/channels-repo.test.ts` *(extend)*:
  - `rename` updates name (already exists).
  - `delete` with empty channel succeeds.
  - `delete` with non-empty channel + `force: false` throws / returns error sentinel.
  - `delete` with `force: true` cascades.

- `tests/integration/channel-sessions-repo.test.ts` *(new)*:
  - `setLabel` writes label + `label_user_set = 1`.
  - `setFirstMessageLabel` is no-op when `label_user_set = 1`.
  - `setFirstMessageLabel` writes when `label_user_set = 0`, leaves `label_user_set = 0`.
  - `delete` removes row only.

- `tests/integration/ipc-router.test.ts` *(extend)*:
  - 5 new methods + extended `channels.delete` (happy path + at least one error path each).
  - `channels.delete` non_empty → expects `err.code === "non_empty"`.
  - `dialog.openFolder` mocked via `vi.mock` of `electron.dialog`.

### L3 — pi-integration

Skip. None of these features touch pi.

### Manual smoke

1. Create channel `foo`, create channel `bar` → both auto-focus.
2. Rename `foo` to `baz` → sidebar updates.
3. Create session in `baz` with custom cwd via picker → auto-focuses, breadcrumb shows path.
4. Send first message → label updates to `<basename>: <message>`.
5. Rename session → breadcrumb updates.
6. Delete session → cleared selection, sidebar updates.
7. Delete `baz` (non-empty) → confirm modal → cascade.
8. Restart app → state persists.

## 12. File structure

```
src/main/
  db/migrations/0003-session_labels.sql                   [new]
  repos/channels.ts                                       [+delete force, error sentinels]
  repos/channel-sessions.ts                               [+setLabel, +setFirstMessageLabel, +delete]
  ipc-router.ts                                           [+5 methods, extend channels.delete]
  dialog-handlers.ts                                      [new]
  default-cwd.ts                                          [new]
  index.ts                                                [wire new handlers + repo deps]
  pi-session-manager.ts                                   [+disposeSession (called on session/channel delete)]

src/shared/
  ipc-types.ts                                            [+5 method types, extend channels.delete]

src/renderer/
  components/ChannelSidebar.tsx                           [hover menus, NewSessionForm, auto-focus, delete handling]
  components/NewSessionForm.tsx                           [new]
  components/RowMenu.tsx                                  [new]
  components/BreadcrumbBar.tsx                            [new]
  components/ConfirmDialog.tsx                            [new]
  components/ChatPane.tsx                                 [breadcrumb]
  state/timeline-state.ts                                 [appendUserMessage triggers setFirstMessageLabel]
  queries.ts                                              [+7 hooks, extend useAttachSession to surface label/cwd]
  util/label.ts                                           [new]

tests/
  unit/label.test.ts                                      [new]
  integration/channels-repo.test.ts                       [+rename/delete cases]
  integration/channel-sessions-repo.test.ts               [new]
  integration/ipc-router.test.ts                          [+~10 new test cases]
```

## 13. Decision log

- **D1.** Auto-label fires from renderer (`appendUserMessage`), not from a pi event handler. Reason: `appendUserMessage` is the single canonical "user just sent the first message" moment in the renderer; pi event ordering can interleave with optimistic UI updates.
- **D2.** Pi session files on disk are never deleted by `session.delete`. Reason: preserves recoverability if user deletes by mistake; `~/.pi/agent/sessions/<id>.jsonl` remains the source of truth for history reconstruction (Plan 4).
- **D3.** `settings.getDefaultCwd` is implemented as a stub (returns `os.homedir()`) rather than a settings-table read. Reason: avoids a settings-table migration before the settings UI exists; the IPC contract is forward-compatible.
- **D4.** Channel cascade-delete is opt-in via `force: true`, not a default. Reason: explicit user acknowledgment for destructive bulk action; native confirm modal is the gate.
- **D5.** Hover-revealed `⋮` menus over right-click context menus or always-visible icons. Reason: discoverable on hover, doesn't clutter the sidebar at rest, matches Slack/Linear/Notion idiom.
- **D6.** Single-line breadcrumb. Reason: chat header is already vertically tight; truncation via CSS `text-overflow: ellipsis` handles long cwds.

## 14. Open items

- The settings UI (which will let the user edit the global default cwd) is a separate future plan. This plan only stubs the IPC.
- Drag-to-reorder of channels and sessions is deferred.
