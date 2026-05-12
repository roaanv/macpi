# macpi Branching — Design Spec

## 1. Summary

Surface pi's existing session-tree branching as a usable feature in macpi. The right-hand `BranchPanel` (currently a placeholder) renders the full session tree in a git-log-style indented view; users switch branches by clicking a tip, branch a conversation in-place by hovering any user message and clicking "↪ Branch here", and fork to a new session via right-click on a branch row. Branches are labellable. The chat pane gains the missing `# channel › session › active branch` breadcrumb. Pi remains authoritative for all tree state; macpi mirrors via `SessionTreeEvent`.

## 2. Goals

- Make pi's branching capability visible and usable from the GUI without inventing new branching semantics.
- Provide a tree view, a switch action, a fork action, and label-renaming — the minimum for branching to be useful day-to-day.
- Stay consistent with established macpi patterns: IPC on demand + invalidate-on-event (mirrors phase 1/2).
- Keep pi as the single source of truth for tree state; macpi has no shadow tree.

## 3. Non-goals (v1)

- LLM-generated summaries of abandoned branches (pi's `navigateTree({summarize: true})` — deferred).
- Bulk branch deletion or pruning.
- Drag-to-reorder branches.
- Side-by-side branch comparison / diff view.
- Showing non-message entries (compaction, model_change, label, session_info) as their own rows — collapsed into edges.
- Renderer component tests via Playwright Electron (deferred to a later milestone, consistent with phase 1/2).

## 4. Glossary

| Term | Meaning |
|---|---|
| **Tree** | pi's append-only session tree. Every entry has `id` + `parentId`. The `leafId` pointer tracks the active branch tip. |
| **Branch** | A path from a divergence-point user message to a leaf. Has one or more user messages. |
| **Branch point** | An entry with more than one displayable child (i.e., a user message under which two or more user messages have been written). |
| **Branch tip** | The most-recent user message on a given branch (leaf of the branch's path). |
| **Active branch** | The branch ending at pi's current `leafId`. |
| **In-place branching** | `agentSession.navigateTree(targetId)` — moves the leaf to an earlier entry. Stays in the same session file. The previous tip is preserved in the tree. |
| **Fork** | `agentSession.fork(entryId, {position})` — creates a new session file containing only the root-to-entry path. The new file becomes a separate macpi session under the same channel. |
| **Label** | A user-set name for a branch tip entry, persisted via pi's `appendLabelChange()`. Defaults to truncated divergence-point user-message text. |

## 5. Architecture

### 5.1 Process model

No new processes. Pi already runs in-process (in the main process) via `@earendil-works/pi-coding-agent`. Branching adds:

- New main-side service: `BranchService` (orchestrates pi calls + sessions-repo writes for fork).
- New pure-function module: `src/main/tree-projection.ts` — converts pi's `SessionTreeNode[]` + `leafId` to renderer-safe `BranchTreeSnapshot`.
- New `PiEvent` variant: `session.tree` — fires when pi emits `SessionTreeEvent`. Carries `sessionId`, `newLeafEntryId`, `oldLeafEntryId`. Does NOT carry the tree itself.
- Four new IPC methods (see §7).

### 5.2 Authoritative state

Pi owns all tree state. Macpi never caches anything pi could overwrite:

- The `BranchTreeSnapshot` lives in TanStack Query cache keyed by macpi `sessionId`. It is treated as a fetched value, not a mutable store.
- Every `session.tree` event invalidates the query and triggers a refetch.
- For fork, macpi DOES write a row to its `sessions` table (a new session needs a `channelId` link, which is macpi data, not pi data) — but the row is just a pointer to pi's new file.

## 6. Data model

### 6.1 Renderer-safe types

New file `src/shared/branch-types.ts`:

```ts
export type BranchNodeKind =
    | "user_message"     // type:session_message, role:user — the rows we render
    | "branch_summary"   // pi's branch_summary entries (informational, shown if present)
    | "root";            // virtual root used when pi's tree has multiple top-level entries

export interface BranchTreeNode {
    entryId: string;             // pi entry id
    kind: BranchNodeKind;
    parentId: string | null;
    label?: string;              // user-set label OR truncated divergence-point text
    summary?: string;            // pi-generated branch summary text (read-only display)
    timestamp: string;           // ISO entry creation
    messageCount?: number;       // user messages from branch's divergence to this tip; only set when isLeafTip === true
    children: BranchTreeNode[];
    isOnActivePath: boolean;
    isBranchPoint: boolean;      // displayable-children > 1
    isLeafTip: boolean;          // no displayable children OR active leaf
}

export interface BranchTreeSnapshot {
    sessionId: string;            // macpi session id
    leafEntryId: string | null;
    roots: BranchTreeNode[];
    hasBranches: boolean;         // any node with displayable-children > 1
    activeBranchLabel?: string;   // label of the active branch tip, used by breadcrumb when hasBranches === true; absent otherwise
}
```

### 6.2 Database schema

**No schema changes.** Branching state is in pi's session files. The `sessions` table already has the columns needed to link to a pi session (`pi_session_path`, `channel_id`, `name`).

Fork insert (in `BranchService.fork`):

```sql
INSERT INTO sessions (id, channel_id, name, pi_session_path, created_at)
VALUES (?, ?, ?, ?, ?)
-- id: macpi-generated ULID
-- channel_id: parent.channel_id
-- name: parent.name + " (fork)"  (user can rename later)
-- pi_session_path: result of agentSession.fork() — pi returns the new file path
```

### 6.3 Tree projection rules

`tree-projection.ts` takes pi's `SessionTreeNode[]` (which includes ALL entry types) and produces displayable nodes:

| pi entry type | Treatment |
|---|---|
| `session_message` role:user | Becomes a `BranchTreeNode` (kind: `user_message`) |
| `session_message` role:assistant | Folded into parent's edge (not its own row) |
| `branch_summary` | Becomes a `BranchTreeNode` (kind: `branch_summary`) under its parent, displayed inline |
| `thinking_level_change` / `model_change` / `compaction` / `label` / `session_info` / `custom` / `custom_message` | Folded into parent's edge (consumed silently) |

After projection:
- `isOnActivePath` = walk pi's `getBranch(leafId)` and mark every id found.
- `messageCount` = count of user messages on the branch path from the divergence-point ancestor (or root) to this tip. Only populated when `isLeafTip === true`; undefined otherwise.
- `label` = pi's label-for-entry OR first 32 chars of the user message text.
- `isBranchPoint` = projected-children count > 1 (NOT pi's raw child count).
- `isLeafTip` = no projected children OR matches `leafEntryId`.

## 7. IPC contract

New methods in `src/shared/ipc-types.ts`:

```ts
"session.getTree": {
    req: { sessionId: string };
    res: BranchTreeSnapshot;
};
"session.navigateTree": {
    req: { sessionId: string; entryId: string };
    res: Record<string, never>;
};
"session.fork": {
    req: { sessionId: string; entryId: string; position?: "before" | "at" };
    res: { newSessionId: string };       // macpi session id, post-DB-insert
};
"session.setEntryLabel": {
    req: { sessionId: string; entryId: string; label: string };  // empty = clear
    res: Record<string, never>;
};
```

Error codes:
- `not_found` — sessionId or entryId doesn't exist.
- `navigate_failed` — pi rejected the navigate (rare).
- `fork_cancelled` — extension cancelled the fork via `SessionBeforeForkEvent` hook.
- `label_failed` — file write failure.

## 8. Event integration

### 8.1 `session.tree` PiEvent

`PiSessionManager` subscribes to `agentSession.on("session_tree", handler)` and emits to renderer:

```ts
{ type: "session.tree", sessionId: string, newLeafEntryId: string | null, oldLeafEntryId: string | null }
```

The payload deliberately omits the tree itself. The renderer reacts by invalidating its query. This keeps event payloads light and avoids drift between snapshot and live tree.

### 8.2 Renderer reaction

Existing `timeline-state.ts` `useEffect` is extended to also handle `session.tree`:

```ts
if (event.type === "session.tree") {
    queryClient.invalidateQueries({ queryKey: ["session.tree", event.sessionId] });
    if (event.newLeafEntryId !== event.oldLeafEntryId) {
        // active branch changed → scroll chat to head of new branch
        queryClient.invalidateQueries({ queryKey: ["session.messages", event.sessionId] });
        scrollChatToBottom();
    }
}
```

### 8.3 Out-of-band changes

Another macpi window (or the pi CLI) can modify the same session file. The `SessionTreeEvent` fires for all subscribers, so macpi naturally re-fetches. If `getTree` returns an entry id the renderer doesn't recognise, we drop the stale snapshot and use the fresh one — the snapshot is the source of truth, no merging.

## 9. UI

### 9.1 BranchPanel

Mounted only when `mode === "chat"` (current behaviour is buggy — visible in all modes; fix as part of this work).

Layout:

```
┌──────────────────────────────┐
│ BRANCHES  (3)                │  ← header, sticky, text-muted
├──────────────────────────────┤
│ ├─ "add login route"         │  ← branch point, label-derived
│ │  ├─● main · 12 msg ✏️       │  ← active tip (filled circle, accent, bold)
│ │  └─○ "refactor try" · 8 ✏️  │  ← inactive tip
│ └─ "fix typo"                │
│    └─○ "explore-pg" · 4 ✏️    │
│                              │
│ [Branch summary — collapsed] │  ← branch_summary node, italic, dim
└──────────────────────────────┘
```

Per tip row:
- `●` filled accent circle if on active path; `○` outline otherwise.
- Label (32-char max, ellipsised).
- Message count of branch path.
- `✏️` rename button (visible on row hover only).
- Right-click → context menu with "Fork to new session".

Click anywhere on an inactive tip → `useNavigateTree({sessionId, entryId: tip.entryId})`.
Active tip is not clickable (visually distinct, no-op).

### 9.2 Empty state

When `hasBranches === false`:

```
BRANCHES
────────
No branches yet.
Hover any message in the chat
and click "↪ Branch here" to fork.
```

### 9.3 In-chat "Branch here" button

`MessageBubble` for user messages renders `MessageBranchButton` in the gutter (visible only on hover):

```
                                       ┌─────────────────────┐
   ↪ Branch here                       │ refactor the auth   │
                                       │ middleware to ...   │
                                       └─────────────────────┘
```

Click → `useNavigateTree({sessionId, entryId: userMessageEntryId})`. Tree panel updates via `session.tree` invalidation; chat scrolls to head (the user message itself + a fresh composer).

Assistant messages do not show this button.

### 9.4 ChatBreadcrumb

New component at the top of `ChatPane`:

```
# refactor-channel  ›  Auth middleware refactor  ›  ↪ refactor try
```

- Channel segment: clickable → `setChannelId`.
- Session segment: text-primary, click is a no-op in v1 (rename UI deferred).
- Branch segment: only rendered when `hasBranches === true`. Shows `activeBranchLabel` from snapshot. No-op click in v1.

### 9.5 Rename UX

Click `✏️` on a tip → in-place `BranchRenameInput` replaces the label with an `<input>` (autofocused, current label selected). Enter → `useSetEntryLabel({sessionId, entryId, label})`. Escape → cancel. Empty submit → clears label (reverts to default).

### 9.6 Fork UX

Right-click tip row → context menu with one item: "Fork to new session". On click:

1. `useForkSession({sessionId, entryId, position: "at"})` fires.
2. Main calls `agentSession.fork(entryId, {position: "at"})` → pi creates new session file.
3. Main inserts new `sessions` row (parent's `channelId`, parent's name + " (fork)", pi's new path).
4. IPC returns `{newSessionId}`.
5. Renderer mutation onSuccess: `setSessionId(newSessionId)` in `App.tsx` state.
6. Channel sidebar's `useSessions` query invalidates → new session appears beneath parent.

### 9.7 Active-branch switch behaviour

1. User clicks inactive tip → `useNavigateTree` mutation fires.
2. Optimistic UI: panel marks the new branch as `●` immediately.
3. Main calls `agentSession.navigateTree(entryId)` → pi fires `session_tree` event.
4. Renderer receives `session.tree` event → invalidates `session.tree` + `session.messages` queries.
5. Chat scrolls to bottom (head of new branch). In-flight turn is aborted automatically by pi.

## 10. Components

### 10.1 Main

- `src/main/branch-service.ts` (new) — `BranchService` class, deps: `loadAgentSession`, `sessionsRepo`. Methods: `getTree`, `navigateTree`, `fork`, `setEntryLabel`. Pure delegation to pi + sessions-repo for fork.
- `src/main/tree-projection.ts` (new) — pure function `projectTree(piRoots, leafId, getLabel): BranchTreeSnapshot`. Unit-testable without pi.
- `src/main/pi-session-manager.ts` (modified) — subscribe to `session_tree` event; emit `session.tree` PiEvent; expose `getAgentSession(sessionId)` for BranchService.
- `src/main/ipc-router.ts` (modified) — register 4 new handlers, map errors per §7.
- `src/main/index.ts` (modified) — wire `BranchService` into router deps.
- `src/shared/pi-events.ts` (modified) — add `session.tree` variant.
- `src/shared/ipc-types.ts` (modified) — add 4 IPC methods.

### 10.2 Renderer

- `src/renderer/components/BranchPanel.tsx` (rewrite) — header + tree container + empty state.
- `src/renderer/components/BranchTree.tsx` (new) — recursive tree renderer; indents children; renders `BranchTreeRow` per node.
- `src/renderer/components/BranchTreeRow.tsx` (new) — single row: circle, label, count, hover ✏️, right-click menu.
- `src/renderer/components/BranchRenameInput.tsx` (new) — inline input for rename mode.
- `src/renderer/components/ChatBreadcrumb.tsx` (new) — three-segment breadcrumb above message list.
- `src/renderer/components/MessageBranchButton.tsx` (new) — small button rendered by user `MessageBubble`.
- `src/renderer/queries.ts` (modified) — `useSessionTree`, `useNavigateTree`, `useForkSession`, `useSetEntryLabel`.
- `src/renderer/state/timeline-state.ts` (modified) — extend useEffect to handle `session.tree` event.
- `src/renderer/components/ChatPane.tsx` (modified) — mount `ChatBreadcrumb`; user messages render `MessageBranchButton`.
- `src/renderer/App.tsx` (modified) — move `<BranchPanel />` inside the `mode === "chat"` block; on `useForkSession` onSuccess, update `selectedSessionId`.

## 11. Error handling & recovery

No new banners or modals. All branching failures surface as toasts via the existing toast system (introduced in §11 of the main design spec).

- `navigate_failed`: toast "Could not switch branch — the tree may have changed." Snapshot is invalidated; user sees fresh tree.
- `fork_cancelled`: toast "Fork cancelled by an extension."
- `label_failed`: toast "Could not save label." Inline input stays open for retry.
- `not_found`: toast "Entry no longer exists." Snapshot is invalidated.

Network/process errors during these IPC calls bubble to the existing `ErrorBanner` system; no new path.

## 12. Testing strategy

### 12.1 Layer 1 — Unit (Vitest)

- `tests/unit/tree-projection.test.ts`:
  - Linear session → 1 root, no branches, `hasBranches === false`.
  - Single fork → 1 root with 2 children, branch point flagged.
  - Multi-level branching → nested children, `isOnActivePath` correctly walks pi's `getBranch(leafId)`.
  - Branch with `branch_summary` entry → kind `branch_summary` projected and shown.
  - Multiple pi roots (orphaned subtrees) → virtual root inserted.
  - Pass-through entries (model_change, thinking_level_change, etc.) → folded into parent edges, not visible.
  - `messageCount` correctly sums user messages on each branch path.
  - `label` default = truncated user-message text when no pi label set; pi label wins when present.

### 12.2 Layer 2 — Integration (Vitest)

- `tests/integration/branch-service.test.ts`:
  - `getTree` returns a snapshot matching the projected tree.
  - `navigateTree` delegates to pi and resolves on success.
  - `fork` calls pi + inserts a sessions row with parent's channelId + correct name.
  - `setEntryLabel` delegates to pi.
  - `not_found` thrown for unknown sessionId / entryId.
- `tests/integration/ipc-router.test.ts` (extend existing):
  - 4 new handler stubs added to mock.
  - Error mapping verified (navigate_failed / fork_cancelled / label_failed / not_found).

### 12.3 Layer 3 — pi-integration (Vitest)

- `tests/pi-integration/branching.test.ts`:
  - Real pi session: prompt → fork → tree contains both branches → navigateTree back → leaf returns to original.
  - Asserts messages on each branch path are isolated.
  - `session.tree` event arrives with correct `oldLeafEntryId` / `newLeafEntryId`.

### 12.4 Layer 4 — E2E (Playwright Electron)

Deferred to a later milestone (consistent with phase 1/2). Covered by manual smoke for now.

### 12.5 Manual smoke (deferred, separate task)

Documented in plan §final step:

1. Open a session with linear history → BranchPanel shows empty state.
2. Hover a user message mid-chat → `↪ Branch here` button appears → click → leaf moves; new prompt creates a divergent branch; BranchPanel now shows 2 tips.
3. Click the inactive tip → chat re-renders with that branch's messages; active marker swaps.
4. Right-click a tip → "Fork to new session" → new session appears in channel sidebar; chat navigates to it; tree is now linear in the new session.
5. Click ✏️ on a tip → rename to "exp" → reload macpi → label persists.
6. Switch to skills mode → BranchPanel disappears. Switch back to chat → it returns.
7. Breadcrumb shows `# channel › session › branch label`. Branch segment hides on linear sessions.

## 13. Decision log

| ID | Decision | Rejected alternative |
|---|---|---|
| D1 | Renderer fetches tree; event is invalidation-only | Stream tree in event payload (heavier per-event cost; not needed at human speed) |
| D2 | `navigateTree` is default; fork is right-click | Inline two-button gesture (cluttered chat UI) |
| D3 | Show labels; default to truncated divergence-point text | Defer labelling entirely (panel becomes hard to scan with long sessions) |
| D4 | Inline "↪ Branch here" on user messages | Dialog-only branch picker (less discoverable; centralised) |
| D5 | Indented git-log-style tree | Chip-style branch list (loses parent/child relationship) |
| D6 | Fork navigates to new session immediately | Fork stays in old session, user picks new session manually (fights pi's authoritative state) |
| D7 | `BranchPanel` mounts only in chat mode | Always mounted (current bug; spec §7.1 already calls for chat-only) |
| D8 | No summarize-on-abandon UI in v1 | Modal asking whether to summarize on every navigate (cognitive overhead; rarely useful) |

## 14. Open items / future work

- LLM summary of abandoned branches (pi's `navigateTree({summarize: true})`).
- Branch deletion / pruning UI (pi doesn't currently expose this).
- Branch diff view.
- Drag-to-reorder branches in the panel.
- Renderer component tests via Playwright Electron (when E2E layer lands).
- Session rename on breadcrumb click.
- Hover preview of a branch's messages without switching to it.

## 15. Glossary of pi APIs used

| API | Use |
|---|---|
| `AgentSession.sessionManager.getTree()` | Read tree snapshot in `BranchService.getTree` |
| `AgentSession.sessionManager.getBranch(leafId?)` | Compute `isOnActivePath` in projection |
| `AgentSession.sessionManager.getLeafId()` | Snapshot's `leafEntryId` |
| `AgentSession.sessionManager.getLabel(id)` | Label lookup for projection |
| `AgentSession.navigateTree(targetId, options?)` | In-place branch switch |
| `AgentSession.fork(entryId, options?)` | Fork to new session file |
| `AgentSession.sessionManager.appendLabelChange(targetId, label?)` | Set or clear label |
| `agentSession.on("session_tree", ...)` | Live tree update subscription |
| `SessionTreeEvent` | `newLeafId`, `oldLeafId`, optional `summaryEntry` |
| `SessionBeforeForkEvent` | Not handled — left to extensions to cancel if they want |
