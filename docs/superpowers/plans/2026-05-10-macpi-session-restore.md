# macpi Session Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing pi sessions survive macpi restarts — selecting a previously-created session shows its message history and lets the user send new messages to it.

**Architecture:** Pi's SDK already persists each session as a JSONL file at `~/.pi/agent/sessions/<encoded-cwd>/<isoTimestamp>_<sessionId>.jsonl`. We add (1) a DB column storing each session's file path so restore is O(1), (2) a `PiSessionManager.attachSession()` method that calls `SessionManager.open(path)` + `createAgentSession({sessionManager})`, (3) a translator that turns the session's `AgentMessage[]` into our renderer's `TimelineEntry[]`, and (4) a single new IPC method `session.attach({piSessionId})` that the renderer fires whenever the active session changes. After attach, prompts/clearQueue/abort continue to work because the session is now in the active map.

**Tech Stack:** Same as Plans 1–3. No new dependencies. Uses `@earendil-works/pi-coding-agent`'s existing `SessionManager.open()` and `AgentSession.messages` APIs, both already exposed via the package's typings.

**Out of scope for this plan (deferred):**

- **Branching UI** (`SessionTreeEvent` panel, branch-from-message, click-to-switch active branch). Originally planned as Plan 4; bumped to Plan 5 because branching is meaningless without restore.
- **Per-item queue cancel-x.** Plan 3 deferral still applies.
- **Slash-command / @skill autocomplete.** Plan 3 deferral still applies.
- **Image attachments.** Composer stays text-only.
- **Compaction summaries / branch summaries** (custom message types). The translator will skip them in v1; renderer can handle them in a later plan.
- **Live "session reloaded" affordance for shared sessions** (e.g. another macpi instance modifying the same session file). Single-writer assumption.

**Carried forward from Plans 1–3 (read this — it bites otherwise):**

1. **Pi runs in main process.** No utility process. PiSessionManager owns sessions in-process.
2. **`@earendil-works/pi-coding-agent` and `pi-ai` are ESM-only.** Static `import { ... } from "..."` in CJS bundle compiles to `require()` and fails at runtime. Use **dynamic `import()` cached behind a helper**, like `pi-session-manager.ts` already does (`loadPi()`). `import type { ... }` is fine.
3. **`node:sqlite` row casts.** Any new repo or query that returns rows must cast as `as unknown as RowType` because of `SQLOutputValue`.
4. **`@earendil-works/*` packages must stay externalized in `vite.main.config.ts`.**
5. **Pi's auto-retry is regex-gated.** Not relevant here unless we add a layer-3 test that triggers retry — none of T1–T9 do.
6. **The IDE-LSP shows spurious JSX/module diagnostics.** Ground truth is `npm run typecheck`.
7. **Faux provider streams synchronously.** Layer-3 tests that interleave with a turn-in-flight need the FauxResponseFactory Promise-delay pattern (T5 of Plan 3 was the precedent). Plan 4's layer-3 test (T9) does NOT need this — it tests post-restart restore, not mid-stream interleaving.

---

## File structure created or modified

```
src/
  main/
    db/
      migrations/
        002_channel_sessions_paths.sql      # NEW — adds cwd + session_file_path columns
    repos/
      channel-sessions.ts                   # MODIFIED — read/write new columns
    pi-session-manager.ts                   # MODIFIED — populate path on create; add attachSession + getHistory
    pi-history.ts                           # NEW — pure translator: AgentMessage[] → TimelineEntry[]
    ipc-router.ts                           # MODIFIED — wire session.attach
  shared/
    ipc-types.ts                            # MODIFIED — add session.attach method
  renderer/
    queries.ts                              # MODIFIED — add useAttachSession
    state/
      timeline-state.ts                     # MODIFIED — accept initial timeline
    components/
      ChatPane.tsx                          # MODIFIED — fire attach on session change

tests/
  unit/
    pi-history.test.ts                      # NEW — translator unit tests (TDD)
  integration/
    ipc-router.test.ts                      # MODIFIED — assert session.attach dispatch
    channels-repo.test.ts                   # MODIFIED — assert new columns on read/write
  pi-integration/
    restore.test.ts                         # NEW — Layer-3: round-trip create → dispose → attach → assert history
```

The translator (`pi-history.ts`) sits in `main/` (not `shared/`) because it imports pi SDK types and is only ever invoked from the main process.

---

## Conventions for this plan

- **Project root** is `/Users/roaanv/mycode/macpi`. Implementation should happen in a fresh worktree (e.g. `.claude/worktrees/session-restore`) created off `main` (Plan 4 will be merged after the Plan 3 work completes; create the worktree off whatever HEAD `main` is at then).
- **TDD** for `pi-history.ts` (pure function, easy unit test) and the IPC router test (mocked manager). Layer-3 round-trip test verifies the integration. UI not unit-tested.
- **Conventional commits**: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `build:` with parenthesised scope.
- **Run `npm run format && npm run lint && npm run typecheck && npm test` before each commit.** No skipping. Biome will reformat — let it.
- **All commands run from the worktree root** unless stated otherwise.
- **SDK source of truth** for this plan:
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.d.ts:303` — `SessionManager.open(path, sessionDir?, cwdOverride?): SessionManager`.
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts:284` — `get messages(): AgentMessage[]`.
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts:290` — `get sessionFile(): string | undefined`.
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts:50` — `CreateAgentSessionOptions.sessionManager?: SessionManager`.
  - `node_modules/@earendil-works/pi-ai/dist/types.d.ts:98–123` — `TextContent`, `ThinkingContent`, `ToolCall` shapes for the assistant's content array.
  - `node_modules/@earendil-works/pi-ai/dist/types.d.ts:139–167` — `UserMessage`, `AssistantMessage`, `ToolResultMessage` definitions.

---

## Phase A — DB schema + repo

### Task 1: Migration 002 adds `cwd` and `session_file_path` columns to `channel_sessions`

**Files:**
- Create: `src/main/db/migrations/002_channel_sessions_paths.sql`
- Modify: `tests/unit/migrations.test.ts` (add a case asserting the columns exist after migration)

Both columns are nullable to handle pre-existing rows (the user's smoke-test sessions). New rows always populate them; old rows get populated lazily on first attach via a disk scan (T4).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/migrations.test.ts` inside the existing `describe(...)` block:

```ts
it("002 adds cwd and session_file_path columns to channel_sessions", () => {
    const db = openDb({ filename: ":memory:" });
    runMigrations(db);
    const cols = (db.prepare("PRAGMA table_info(channel_sessions)").all() as unknown as Array<{ name: string }>)
        .map((c) => c.name);
    expect(cols).toContain("cwd");
    expect(cols).toContain("session_file_path");
    db.close();
});
```

(Imports `openDb`/`runMigrations` already exist in this file.)

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/unit/migrations.test.ts
```

Expected: 1 failing.

- [ ] **Step 3: Create the migration file**

Create `src/main/db/migrations/002_channel_sessions_paths.sql`:

```sql
ALTER TABLE channel_sessions ADD COLUMN cwd TEXT;
ALTER TABLE channel_sessions ADD COLUMN session_file_path TEXT;
```

(SQLite ALTER TABLE only allows one ADD COLUMN per statement, hence two lines.)

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- tests/unit/migrations.test.ts
```

Expected: pass. The full suite count grows by 1.

- [ ] **Step 5: Run full suite + verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: all 49 prior + 1 new = 50 pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations/002_channel_sessions_paths.sql tests/unit/migrations.test.ts
git commit -m "build(db): migration 002 — channel_sessions.cwd + session_file_path"
```

---

### Task 2: Update `ChannelSessionsRepo` to read/write `cwd` + `session_file_path`

**Files:**
- Modify: `src/main/repos/channel-sessions.ts`
- Modify: `tests/integration/channels-repo.test.ts`

Today's `add()` takes `(channelId, piSessionId)`. We widen it to also accept `(cwd, sessionFilePath)`. We add `setSessionFilePath(piSessionId, path)` for the lazy-discovery path. We extend `listForChannel()` to optionally include the metadata.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("ChannelSessionsRepo", ...)` block in `tests/integration/channels-repo.test.ts`:

```ts
it("add() persists cwd and session_file_path", () => {
    const channelId = "ch-test";
    channelsRepo.create({ id: channelId, name: "Test", position: 0, icon: null });

    repo.add({
        channelId,
        piSessionId: "pi-1",
        cwd: "/tmp/work",
        sessionFilePath: "/Users/x/.pi/agent/sessions/abc/def.jsonl",
    });

    const meta = repo.getMeta("pi-1");
    expect(meta).toEqual({
        piSessionId: "pi-1",
        cwd: "/tmp/work",
        sessionFilePath: "/Users/x/.pi/agent/sessions/abc/def.jsonl",
    });
});

it("setSessionFilePath updates the path for an existing session", () => {
    const channelId = "ch-test2";
    channelsRepo.create({ id: channelId, name: "Test2", position: 0, icon: null });
    repo.add({
        channelId,
        piSessionId: "pi-2",
        cwd: "/tmp/work2",
        sessionFilePath: null,
    });

    repo.setSessionFilePath("pi-2", "/discovered/path.jsonl");
    expect(repo.getMeta("pi-2")?.sessionFilePath).toBe("/discovered/path.jsonl");
});

it("getMeta returns null for an unknown session", () => {
    expect(repo.getMeta("does-not-exist")).toBe(null);
});
```

(`channelsRepo` is the existing setup variable in the test file. `repo` is `channelSessionsRepo`.)

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/integration/channels-repo.test.ts
```

Expected: 3 failing tests (`add` signature mismatch, `getMeta` undefined, `setSessionFilePath` undefined). Existing 10 tests in this file still pass — the existing `add(channelId, piSessionId)` callsites need to keep working too.

- [ ] **Step 3: Replace `src/main/repos/channel-sessions.ts`**

```ts
// Repo for channel ↔ pi-session links plus per-session metadata (cwd, on-disk
// session-file path). cwd and sessionFilePath are nullable for backward
// compatibility — pre-restore-feature rows have neither populated, and
// PiSessionManager will discover the path on first attach.

import type { DbHandle } from "../db/connection";

export interface AddArgs {
    channelId: string;
    piSessionId: string;
    cwd: string | null;
    sessionFilePath: string | null;
}

export interface SessionMeta {
    piSessionId: string;
    cwd: string | null;
    sessionFilePath: string | null;
}

export class ChannelSessionsRepo {
    constructor(private readonly db: DbHandle) {}

    add(args: AddArgs): void {
        const next = this.nextPosition(args.channelId);
        this.db.prepare(
            "INSERT INTO channel_sessions (channel_id, pi_session_id, position, added_at, cwd, session_file_path) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(
            args.channelId,
            args.piSessionId,
            next,
            Date.now(),
            args.cwd,
            args.sessionFilePath,
        );
    }

    remove(channelId: string, piSessionId: string): void {
        this.db.prepare(
            "DELETE FROM channel_sessions WHERE channel_id = ? AND pi_session_id = ?",
        ).run(channelId, piSessionId);
    }

    listForChannel(channelId: string): string[] {
        const rows = this.db.prepare(
            "SELECT pi_session_id AS piSessionId FROM channel_sessions WHERE channel_id = ? ORDER BY position ASC",
        ).all(channelId) as unknown as Array<{ piSessionId: string }>;
        return rows.map((r) => r.piSessionId);
    }

    getChannelIdFor(piSessionId: string): string | null {
        const row = this.db.prepare(
            "SELECT channel_id AS channelId FROM channel_sessions WHERE pi_session_id = ?",
        ).get(piSessionId) as unknown as { channelId: string } | undefined;
        return row?.channelId ?? null;
    }

    getMeta(piSessionId: string): SessionMeta | null {
        const row = this.db.prepare(
            "SELECT pi_session_id AS piSessionId, cwd, session_file_path AS sessionFilePath FROM channel_sessions WHERE pi_session_id = ?",
        ).get(piSessionId) as unknown as
            | { piSessionId: string; cwd: string | null; sessionFilePath: string | null }
            | undefined;
        if (!row) return null;
        return {
            piSessionId: row.piSessionId,
            cwd: row.cwd,
            sessionFilePath: row.sessionFilePath,
        };
    }

    setSessionFilePath(piSessionId: string, path: string): void {
        this.db.prepare(
            "UPDATE channel_sessions SET session_file_path = ? WHERE pi_session_id = ?",
        ).run(path, piSessionId);
    }

    private nextPosition(channelId: string): number {
        const row = this.db.prepare(
            "SELECT MAX(position) AS max FROM channel_sessions WHERE channel_id = ?",
        ).get(channelId) as unknown as { max: number | null } | undefined;
        return (row?.max ?? -1) + 1;
    }
}
```

The signature of `add()` changed from `(channelId, piSessionId)` to `add({channelId, piSessionId, cwd, sessionFilePath})`. **Update every call site** to match. The two places to look:

1. `src/main/ipc-router.ts` — search for `channelSessions.add` (or similar).
2. `tests/integration/channels-repo.test.ts` — earlier tests call `repo.add(...)` with the old signature; rewrite each to pass an object with `cwd: null, sessionFilePath: null` so they still pass without exercising the new behavior.

- [ ] **Step 4: Update the call sites**

In `src/main/ipc-router.ts`, find the `session.create` handler. The current call probably looks like:

```ts
this.deps.channelSessions.add(args.channelId, piSessionId);
```

Replace with:

```ts
this.deps.channelSessions.add({
    channelId: args.channelId,
    piSessionId,
    cwd: args.cwd,
    sessionFilePath: null, // populated by PiSessionManager.createSession (T3)
});
```

(The `null` is a placeholder for now; T3 will change `createSession` to return the path so we can persist it here.)

In existing tests in `tests/integration/channels-repo.test.ts`, find each `repo.add(channelId, piSessionId)` call and rewrite to:

```ts
repo.add({ channelId, piSessionId, cwd: null, sessionFilePath: null });
```

- [ ] **Step 5: Run, expect pass**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 50 + 3 new = 53 tests pass. Existing 10 channels-repo tests still pass after the call-site rewrite.

- [ ] **Step 6: Commit**

```bash
git add src/main/repos/channel-sessions.ts src/main/ipc-router.ts tests/integration/channels-repo.test.ts
git commit -m "feat(repo): widen channel_sessions with cwd + session_file_path"
```

---

## Phase B — Translator + manager attach

### Task 3: TDD `pi-history.ts` — `agentMessagesToTimeline(messages: AgentMessage[]): TimelineEntry[]`

**Files:**
- Create: `tests/unit/pi-history.test.ts`
- Create: `src/main/pi-history.ts`

A pure function that turns pi's persisted message log into the renderer's timeline shape. No SDK runtime imports — only `import type` from `@earendil-works/pi-ai`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/pi-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { agentMessagesToTimeline } from "../../src/main/pi-history";

// We mint plain object literals shaped like pi-ai's persisted Message variants.
// The translator only reads structural properties, so this avoids depending on
// SDK constructors at unit-test layer.

describe("agentMessagesToTimeline", () => {
    it("returns empty for an empty message list", () => {
        expect(agentMessagesToTimeline([])).toEqual([]);
    });

    it("translates a user message with string content", () => {
        const result = agentMessagesToTimeline([
            { role: "user", content: "hello", timestamp: 1 },
        ]);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ kind: "user", text: "hello" });
    });

    it("translates a user message with content array", () => {
        const result = agentMessagesToTimeline([
            {
                role: "user",
                content: [{ type: "text", text: "hi " }, { type: "text", text: "there" }],
                timestamp: 1,
            },
        ]);
        expect(result[0]).toMatchObject({ kind: "user", text: "hi there" });
    });

    it("translates an assistant message with text + thinking", () => {
        const result = agentMessagesToTimeline([
            {
                role: "assistant",
                content: [
                    { type: "thinking", thinking: "let me think" },
                    { type: "text", text: "the answer is 42" },
                ],
                stopReason: "stop",
                timestamp: 1,
            } as never,
        ]);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            kind: "assistant-text",
            text: "the answer is 42",
            thinking: "let me think",
            streaming: false,
        });
    });

    it("translates a tool call + result pair into a single tool-call entry", () => {
        const result = agentMessagesToTimeline([
            {
                role: "assistant",
                content: [
                    { type: "text", text: "I'll list files" },
                    {
                        type: "toolCall",
                        id: "tc-1",
                        name: "ls",
                        arguments: { path: "." },
                    },
                ],
                stopReason: "toolUse",
                timestamp: 1,
            } as never,
            {
                role: "toolResult",
                toolCallId: "tc-1",
                toolName: "ls",
                content: [{ type: "text", text: "file1\nfile2" }],
                isError: false,
                timestamp: 2,
            } as never,
        ]);

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ kind: "assistant-text", text: "I'll list files" });
        expect(result[1]).toMatchObject({
            kind: "tool-call",
            id: "tc-1",
            toolName: "ls",
            args: { path: "." },
            state: "ok",
        });
    });

    it("marks tool-call as error when result.isError is true", () => {
        const result = agentMessagesToTimeline([
            {
                role: "assistant",
                content: [
                    { type: "toolCall", id: "tc-2", name: "bash", arguments: { command: "false" } },
                ],
                stopReason: "toolUse",
                timestamp: 1,
            } as never,
            {
                role: "toolResult",
                toolCallId: "tc-2",
                toolName: "bash",
                content: [{ type: "text", text: "exit 1" }],
                isError: true,
                timestamp: 2,
            } as never,
        ]);

        const toolEntry = result.find((e) => e.kind === "tool-call");
        expect(toolEntry).toMatchObject({ state: "error" });
    });

    it("leaves an unmatched tool-call as pending", () => {
        const result = agentMessagesToTimeline([
            {
                role: "assistant",
                content: [
                    { type: "toolCall", id: "tc-orphan", name: "ls", arguments: {} },
                ],
                stopReason: "toolUse",
                timestamp: 1,
            } as never,
        ]);
        const toolEntry = result.find((e) => e.kind === "tool-call");
        expect(toolEntry).toMatchObject({ state: "pending", result: null });
    });

    it("skips unknown message types without crashing", () => {
        const result = agentMessagesToTimeline([
            { role: "user", content: "hi", timestamp: 1 },
            // A custom-message-like shape pi might persist; translator should ignore it
            { customType: "branchSummary", content: "ignored", timestamp: 2 } as never,
            {
                role: "assistant",
                content: [{ type: "text", text: "hello" }],
                stopReason: "stop",
                timestamp: 3,
            } as never,
        ]);
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ kind: "user" });
        expect(result[1]).toMatchObject({ kind: "assistant-text" });
    });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/unit/pi-history.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/pi-history.ts`**

```ts
// Pure translator from pi's persisted AgentMessage[] to macpi's renderer-side
// TimelineEntry[]. Used at session-restore time. Never imports SDK runtime
// values — only types — so it can be unit-tested without standing up pi.

import type { TimelineEntry } from "../renderer/types/timeline";

// Local structural shapes mirroring @earendil-works/pi-ai's persisted Message
// variants. We don't import the SDK types directly because (a) types are
// erased at runtime so the import would still tree-shake fine but (b) keeping
// the shapes local makes the translator testable with object literals.

interface UserMessageLike {
    role: "user";
    content: string | Array<{ type: string; text?: string }>;
}
interface ToolCallLike {
    type: "toolCall";
    id: string;
    name: string;
    arguments: unknown;
}
interface AssistantMessageLike {
    role: "assistant";
    content: Array<
        | { type: "text"; text: string }
        | { type: "thinking"; thinking: string }
        | ToolCallLike
        | { type: string; [k: string]: unknown }
    >;
}
interface ToolResultMessageLike {
    role: "toolResult";
    toolCallId: string;
    toolName: string;
    content: Array<{ type: string; text?: string }>;
    isError: boolean;
}
type MessageLike =
    | UserMessageLike
    | AssistantMessageLike
    | ToolResultMessageLike
    | { [k: string]: unknown };

let counter = 0;
const nextId = () => `r${++counter}`;

export function agentMessagesToTimeline(messages: ReadonlyArray<unknown>): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    const toolEntryById = new Map<string, Extract<TimelineEntry, { kind: "tool-call" }>>();

    for (const raw of messages) {
        const msg = raw as MessageLike;
        if (!msg || typeof msg !== "object") continue;

        if ("role" in msg && msg.role === "user") {
            entries.push({
                kind: "user",
                id: nextId(),
                text: extractUserText(msg as UserMessageLike),
            });
            continue;
        }

        if ("role" in msg && msg.role === "assistant") {
            const am = msg as AssistantMessageLike;
            let text = "";
            let thinking = "";
            const calls: ToolCallLike[] = [];
            for (const c of am.content) {
                if (c.type === "text" && typeof (c as { text?: unknown }).text === "string") {
                    text += (c as { text: string }).text;
                } else if (
                    c.type === "thinking" &&
                    typeof (c as { thinking?: unknown }).thinking === "string"
                ) {
                    thinking += (c as { thinking: string }).thinking;
                } else if (c.type === "toolCall") {
                    calls.push(c as ToolCallLike);
                }
            }
            if (text.length > 0 || thinking.length > 0) {
                entries.push({
                    kind: "assistant-text",
                    id: nextId(),
                    text,
                    thinking,
                    streaming: false,
                });
            }
            for (const tc of calls) {
                const entry = {
                    kind: "tool-call" as const,
                    id: tc.id,
                    toolName: tc.name,
                    args: tc.arguments,
                    state: "pending" as const,
                    result: null as unknown,
                };
                entries.push(entry);
                toolEntryById.set(tc.id, entry);
            }
            continue;
        }

        if ("role" in msg && msg.role === "toolResult") {
            const tr = msg as ToolResultMessageLike;
            const target = toolEntryById.get(tr.toolCallId);
            if (target) {
                target.state = tr.isError ? "error" : "ok";
                target.result = extractToolResultContent(tr);
            }
            continue;
        }

        // Custom messages, BashExecutionMessage, BranchSummaryMessage, etc.
        // Skip in v1 — renderer can surface these in a later plan.
    }

    return entries;
}

function extractUserText(msg: UserMessageLike): string {
    if (typeof msg.content === "string") return msg.content;
    return msg.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => (c as { text: string }).text)
        .join("");
}

function extractToolResultContent(msg: ToolResultMessageLike): unknown {
    // If the result is a single text content, return it as a string for nicer
    // ToolBlock rendering. Otherwise return the content array verbatim.
    if (msg.content.length === 1 && msg.content[0].type === "text") {
        return msg.content[0].text ?? "";
    }
    return msg.content;
}
```

The `state` and `result` mutations on `target` rely on the entry being a referenced object (Maps store object references). The `as const` on `state: "pending"` would make TS treat target as readonly; we mitigate by widening via the explicit `state` assignment. The `target.state = ... ` line will cause a TS error because `state` is widened to a literal union. Fix by typing `target` more loosely — see the `Extract<TimelineEntry, ...>` cast above which still permits assignment within the union.

If TS complains: relax the entry type with explicit annotation:

```ts
const entry: Extract<TimelineEntry, { kind: "tool-call" }> = {
    kind: "tool-call",
    id: tc.id,
    ...
};
```

(then assignments to `entry.state = "ok"` work because the field is typed as the union.)

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- tests/unit/pi-history.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Run full suite + verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 53 + 8 = 61 pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/pi-history.ts tests/unit/pi-history.test.ts
git commit -m "feat(history): translator from pi AgentMessage[] to renderer TimelineEntry[]"
```

---

### Task 4: `PiSessionManager.createSession` populates `session_file_path`; add `attachSession` + `getHistory`

**Files:**
- Modify: `src/main/pi-session-manager.ts`

`createSession` already creates a session and registers it in the active map. After T4, it ALSO returns the session file path so the IPC router can persist it. `attachSession` opens an existing session by piSessionId — looking up the path via the `ChannelSessionsRepo`, falling back to a disk scan for sessions created before this plan.

We need a reference to the repo inside `PiSessionManager`. Today the manager stands alone. Easiest: pass a small helper function via constructor or via a setter so the manager doesn't depend on the full repo type.

- [ ] **Step 1: Replace `src/main/pi-session-manager.ts`**

Open the file. There's a lot here; keep the existing imports, the `loadPi()` helper, the `PiTestOverrides` type, and the `translate()` switch. The changes are:

1. Add an interface `SessionPathStore` describing the methods PiSessionManager calls on the repo.
2. Add a setter `setPathStore(store: SessionPathStore)` and a private `pathStore?: SessionPathStore` field.
3. Change `createSession` to:
   - Resolve the `sessionFile` from the created `AgentSession` (via the SDK's `session.sessionFile` getter).
   - Return both the `piSessionId` AND the `sessionFile` so the caller (ipc-router) can persist them together.
4. Add `attachSession({piSessionId})`:
   - If session already in the active map, return immediately.
   - Otherwise: look up the path from `pathStore.getSessionFilePath(piSessionId)`. If null, scan `~/.pi/agent/sessions/**/*${piSessionId}.jsonl` to discover. Persist the discovered path via `pathStore.setSessionFilePath`.
   - Open the session via `mod.SessionManager.open(path)` and `mod.createAgentSession({sessionManager})`.
   - Subscribe to events.
5. Add `getHistory(piSessionId)`: returns the active session's `messages` (already translated via `pi-history`). Throws `unknown session` if not active.

Append the following new types/methods to the existing class:

```ts
import { agentMessagesToTimeline } from "./pi-history";
import type { TimelineEntry } from "../renderer/types/timeline";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface SessionPathStore {
    getSessionFilePath(piSessionId: string): string | null;
    setSessionFilePath(piSessionId: string, path: string): void;
}
```

Inside the class body:

```ts
private pathStore?: SessionPathStore;

setPathStore(store: SessionPathStore): void {
    this.pathStore = store;
}
```

Replace the existing `createSession` method with:

```ts
async createSession(opts: {
    cwd: string;
}): Promise<{ piSessionId: string; sessionFilePath: string | null }> {
    const ctx = await this.ensureContext();
    const ov = this.__testOverrides;
    const result = await ctx.mod.createAgentSession({
        cwd: opts.cwd,
        authStorage: ov?.authStorage ?? ctx.auth,
        modelRegistry: ov?.modelRegistry ?? ctx.registry,
        resourceLoader: ov?.resourceLoader,
        settingsManager: ov?.settingsManager,
        model: ov?.model,
    });
    const session = result.session;
    const piSessionId = session.sessionId;
    const sessionFilePath = session.sessionFile ?? null;
    const unsubscribe = session.subscribe((event) =>
        this.translate(piSessionId, event),
    );
    this.active.set(piSessionId, { piSessionId, session, unsubscribe });
    return { piSessionId, sessionFilePath };
}
```

Add a new `attachSession` method right after `createSession`:

```ts
async attachSession(opts: { piSessionId: string }): Promise<void> {
    if (this.active.has(opts.piSessionId)) return;
    const ctx = await this.ensureContext();

    let filePath = this.pathStore?.getSessionFilePath(opts.piSessionId) ?? null;
    if (!filePath) {
        filePath = discoverSessionFile(opts.piSessionId);
        if (!filePath) {
            throw new Error(
                `session file not found on disk for ${opts.piSessionId}. ` +
                `Tried ~/.pi/agent/sessions/**/<id>.jsonl.`,
            );
        }
        this.pathStore?.setSessionFilePath(opts.piSessionId, filePath);
    }

    const ov = this.__testOverrides;
    const sessionManager = ctx.mod.SessionManager.open(filePath);
    const result = await ctx.mod.createAgentSession({
        cwd: sessionManager.getCwd(),
        authStorage: ov?.authStorage ?? ctx.auth,
        modelRegistry: ov?.modelRegistry ?? ctx.registry,
        resourceLoader: ov?.resourceLoader,
        settingsManager: ov?.settingsManager,
        model: ov?.model,
        sessionManager,
    });
    const session = result.session;
    const piSessionId = session.sessionId;
    const unsubscribe = session.subscribe((event) =>
        this.translate(piSessionId, event),
    );
    this.active.set(piSessionId, { piSessionId, session, unsubscribe });
}
```

Add a `getHistory` method right after `attachSession`:

```ts
getHistory(piSessionId: string): TimelineEntry[] {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    return agentMessagesToTimeline(active.session.messages);
}
```

Add `discoverSessionFile` as a free function at module bottom (after the class):

```ts
function discoverSessionFile(piSessionId: string): string | null {
    const root = path.join(os.homedir(), ".pi", "agent", "sessions");
    if (!fs.existsSync(root)) return null;
    for (const dir of fs.readdirSync(root)) {
        const dirPath = path.join(root, dir);
        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) continue;
        for (const file of fs.readdirSync(dirPath)) {
            if (file.endsWith(`${piSessionId}.jsonl`)) {
                return path.join(dirPath, file);
            }
        }
    }
    return null;
}
```

(The pi session-file naming convention is `<isoTimestamp>_<sessionId>.jsonl`. Suffix-match on `${piSessionId}.jsonl` to find the right file. This scan only runs once per restored session — the result is cached back to the DB via `setSessionFilePath`.)

- [ ] **Step 2: Update the IPC router's `session.create` handler**

In `src/main/ipc-router.ts`, the existing `session.create` handler today calls something like:

```ts
const piSessionId = await this.deps.piSessionManager.createSession({ cwd: args.cwd });
this.deps.channelSessions.add({...piSessionId..., sessionFilePath: null});
return ok({ piSessionId });
```

Update it to use the new return shape:

```ts
this.register("session.create", async (args) => {
    const channel = this.deps.channels.getById(args.channelId);
    if (!channel) {
        return err("channel.not_found", `channel ${args.channelId} not found`);
    }
    const { piSessionId, sessionFilePath } = await this.deps.piSessionManager.createSession({
        cwd: args.cwd,
    });
    this.deps.channelSessions.add({
        channelId: args.channelId,
        piSessionId,
        cwd: args.cwd,
        sessionFilePath,
    });
    return ok({ piSessionId });
});
```

(Adjust the surrounding lines to whatever the existing handler looks like — the key change is `createSession` returning an object now.)

- [ ] **Step 3: Wire the path store at startup**

In `src/main/index.ts` (the main entry point), wherever `PiSessionManager` and `ChannelSessionsRepo` are instantiated, call:

```ts
piSessionManager.setPathStore({
    getSessionFilePath: (id) => channelSessionsRepo.getMeta(id)?.sessionFilePath ?? null,
    setSessionFilePath: (id, path) => channelSessionsRepo.setSessionFilePath(id, path),
});
```

If the wiring happens through a startup file, place this after both objects are constructed and before the IpcRouter is created. The exact spot will be obvious from the existing startup flow.

- [ ] **Step 4: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 61 tests still pass. The existing ipc-router test `session.create` may need an update because `piSessionManagerMock.createSession` now needs to return `{piSessionId, sessionFilePath}` instead of just a string. Find the mock in `tests/integration/ipc-router.test.ts` and update:

```ts
piSessionManagerMock.createSession.mockResolvedValueOnce({
    piSessionId: "sess-1",
    sessionFilePath: "/tmp/sess-1.jsonl",
});
```

(If the existing test asserted the channels-repo call args, update those too — pass the new `{cwd, sessionFilePath}` shape.)

- [ ] **Step 5: Commit**

```bash
git add src/main/pi-session-manager.ts src/main/ipc-router.ts src/main/index.ts tests/integration/ipc-router.test.ts
git commit -m "feat(restore): persist session_file_path on create; add attachSession + getHistory"
```

---

## Phase C — IPC + queries

### Task 5: TDD `session.attach` IPC method

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

The method takes `{piSessionId}` and returns `{entries: TimelineEntry[]}`. Main calls `manager.attachSession` (idempotent — no-op if already attached) then `manager.getHistory`.

- [ ] **Step 1: Add the type entry**

In `src/shared/ipc-types.ts`, add inside `IpcMethods` after `session.abort`:

```ts
"session.attach": {
    req: { piSessionId: string };
    /** History reconstructed from pi's persisted session log. */
    res: { entries: import("../renderer/types/timeline").TimelineEntry[] };
};
```

(The `import("...")` inline type works in TS 5+ and avoids a top-level import.)

- [ ] **Step 2: Write the failing tests**

Append to `tests/integration/ipc-router.test.ts` inside the existing `describe("IpcRouter", ...)`:

```ts
it("session.attach calls attachSession then returns the translated history", async () => {
    piSessionManagerMock.attachSession.mockResolvedValueOnce(undefined);
    piSessionManagerMock.getHistory.mockReturnValueOnce([
        { kind: "user", id: "r1", text: "hi" },
    ] as TimelineEntry[]);

    const result = await router.dispatch("session.attach", { piSessionId: "s1" });

    expect(result).toEqual({
        ok: true,
        data: { entries: [{ kind: "user", id: "r1", text: "hi" }] },
    });
    expect(piSessionManagerMock.attachSession).toHaveBeenCalledWith({ piSessionId: "s1" });
    expect(piSessionManagerMock.getHistory).toHaveBeenCalledWith("s1");
});

it("session.attach surfaces attach errors as ipc errors", async () => {
    piSessionManagerMock.attachSession.mockRejectedValueOnce(
        new Error("session file not found on disk for s1"),
    );

    const result = await router.dispatch("session.attach", { piSessionId: "s1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.message).toContain("session file not found");
    }
});
```

Add `TimelineEntry` to the imports at the top of the test file:

```ts
import type { TimelineEntry } from "../../src/renderer/types/timeline";
```

Extend the `piSessionManagerMock` type and `beforeEach` setup to include `attachSession` and `getHistory`:

```ts
let piSessionManagerMock: {
    createSession: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    clearQueue: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    attachSession: ReturnType<typeof vi.fn>;
    getHistory: ReturnType<typeof vi.fn>;
};

// ...inside beforeEach:
piSessionManagerMock = {
    createSession: vi.fn(),
    prompt: vi.fn(),
    clearQueue: vi.fn(),
    abort: vi.fn(),
    attachSession: vi.fn(),
    getHistory: vi.fn(),
};
```

- [ ] **Step 3: Run, expect fail**

```bash
npm test -- tests/integration/ipc-router.test.ts
```

Expected: 2 new failing tests.

- [ ] **Step 4: Wire the router**

In `src/main/ipc-router.ts`, add a new registration right after `session.abort`:

```ts
this.register("session.attach", async (args) => {
    await this.deps.piSessionManager.attachSession({ piSessionId: args.piSessionId });
    const entries = this.deps.piSessionManager.getHistory(args.piSessionId);
    return ok({ entries });
});
```

- [ ] **Step 5: Run, expect pass**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 61 + 2 = 63 pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-types.ts src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): route session.attach (returns translated history)"
```

---

### Task 6: Add `useAttachSession` query hook

**Files:**
- Modify: `src/renderer/queries.ts`

A `useQuery` that fires when the user selects a session, fetches the history, and feeds it into the timeline state.

- [ ] **Step 1: Append to `src/renderer/queries.ts`**

```ts
export function useAttachSession(piSessionId: string | null) {
    return useQuery({
        queryKey: ["session.attach", piSessionId],
        queryFn: () =>
            piSessionId
                ? invoke("session.attach", { piSessionId })
                : Promise.resolve({ entries: [] }),
        enabled: !!piSessionId,
        // Once we've attached, the renderer takes over via live PiEvents.
        // No need to refetch on focus or interval.
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });
}
```

- [ ] **Step 2: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 63 still passing (no test changes).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "feat(queries): add useAttachSession query hook"
```

---

## Phase D — Renderer wiring

### Task 7: `useTimeline` accepts an initial timeline

**Files:**
- Modify: `src/renderer/state/timeline-state.ts`

Today the hook resets to `EMPTY` on `piSessionId` change. We add a second param: an `initialTimeline` array. When that array changes (e.g. after attach query resolves), seed the snapshot's `timeline` with it. Subsequent live events update on top.

- [ ] **Step 1: Update the hook signature**

In `src/renderer/state/timeline-state.ts`, find the existing `useTimeline` function:

```ts
export function useTimeline(piSessionId: string | null): {
    snapshot: TimelineSnapshot;
    appendUserMessage: (text: string) => void;
} {
```

Replace with:

```ts
export function useTimeline(
    piSessionId: string | null,
    initialTimeline?: TimelineEntry[],
): {
    snapshot: TimelineSnapshot;
    appendUserMessage: (text: string) => void;
} {
```

Inside the hook body, find:

```ts
React.useEffect(() => {
    setSnapshot(EMPTY);
}, [piSessionId]);
```

Replace with two effects — one resets on session change, one seeds when the initial timeline arrives:

```ts
// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is the meaningful dep
React.useEffect(() => {
    setSnapshot(EMPTY);
}, [piSessionId]);

// biome-ignore lint/correctness/useExhaustiveDependencies: initialTimeline reference is the trigger
React.useEffect(() => {
    if (!initialTimeline || initialTimeline.length === 0) return;
    setSnapshot((prev) => ({ ...prev, timeline: initialTimeline }));
}, [initialTimeline]);
```

(The initialTimeline effect runs AFTER the reset effect because both depend on different deps; React batches effects in declaration order. When piSessionId changes, the reset fires first, then if a non-empty initialTimeline is supplied for the new session, that fires next.)

- [ ] **Step 2: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 63 still passing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/state/timeline-state.ts
git commit -m "feat(timeline): useTimeline accepts an initial timeline param"
```

---

### Task 8: `ChatPane.tsx` fires attach on session change

**Files:**
- Modify: `src/renderer/components/ChatPane.tsx`

When `piSessionId` changes, the new `useAttachSession` query fires; when it resolves, pass the entries to `useTimeline` so the chat populates with history. Keep the existing send/abort/clearQueue wiring intact.

- [ ] **Step 1: Update `ChatPane.tsx`**

Add `useAttachSession` to the imports from `../queries`:

```tsx
import {
    useAbortSession,
    useAttachSession,
    useClearQueue,
    usePromptSession,
} from "../queries";
```

Inside `ChatPane`, just after `const promptMutation = usePromptSession()` and friends:

```tsx
const attachQuery = useAttachSession(piSessionId);
const initialTimeline = attachQuery.data?.entries;
```

Update the call to `useTimeline` to pass it through:

```tsx
const { snapshot, appendUserMessage } = useTimeline(piSessionId, initialTimeline);
```

Optionally show a "loading" placeholder when the attach query is in flight and the user picked a session that hasn't attached yet:

```tsx
if (piSessionId && attachQuery.isLoading) {
    return (
        <div className="flex flex-1 items-center justify-center text-zinc-500">
            Loading session…
        </div>
    );
}
if (piSessionId && attachQuery.isError) {
    const msg = attachQuery.error instanceof Error ? attachQuery.error.message : String(attachQuery.error);
    return (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-zinc-500">
            <div>
                Couldn't attach to session{" "}
                <code className="text-zinc-300">{piSessionId}</code>
                <div className="mt-2 text-xs text-red-300">{msg}</div>
            </div>
        </div>
    );
}
```

Insert these before the existing `if (!piSessionId)` early return.

- [ ] **Step 2: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 63 still passing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChatPane.tsx
git commit -m "feat(chat): wire useAttachSession on session change; seed timeline from history"
```

---

## Phase E — Layer-3 round-trip test

### Task 9: Layer-3 — create → dispose → attach → assert history

**Files:**
- Create: `tests/pi-integration/restore.test.ts`

Use the harness to create a session, prompt it, then simulate an "app restart" by disposing the manager and creating a new one. Attach to the same `piSessionId` and assert the timeline matches.

This test does NOT need the FauxResponseFactory Promise-delay pattern — there's no mid-stream interleaving. We just need a complete turn to land before we restart.

- [ ] **Step 1: Write the test**

Create `tests/pi-integration/restore.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, drive, fauxHelpers, type Harness } from "./test-harness";

describe("layer-3: session restore", () => {
    let harness: Harness | null = null;

    afterEach(() => {
        harness?.dispose();
        harness = null;
    });

    it("attachSession on a fresh manager replays the persisted history", async () => {
        // Phase 1: create + prompt with the original harness.
        harness = await createHarness();
        const { fauxAssistantMessage, fauxText } = await fauxHelpers();
        harness.queueResponse(fauxAssistantMessage(fauxText("hello world")));

        const { piSessionId } = await drive(harness, "say hi");

        // Pi persists session messages on message_end. Confirm the file exists
        // by asking the active session for its sessionFile.
        const piCoding = await import("@earendil-works/pi-coding-agent");
        const sessionFile = (
            harness.manager as unknown as {
                active: Map<string, { session: { sessionFile?: string } }>;
            }
        ).active.get(piSessionId)?.session.sessionFile;
        expect(sessionFile, "expected pi to persist a session file").toBeTruthy();
        expect(piCoding).toBeTruthy(); // sanity that dynamic import works

        // Phase 2: simulate restart — dispose the manager, then build a fresh
        // one and attach to the same session.
        harness.dispose();
        harness = await createHarness();

        // Inject the path so attachSession doesn't have to scan disk.
        // (The actual app uses the DB-backed pathStore; in tests we wire it
        // inline via the test override.)
        const captured: { id: string; path: string } = {
            id: piSessionId,
            path: sessionFile as string,
        };
        harness.manager.setPathStore({
            getSessionFilePath: (id) => (id === captured.id ? captured.path : null),
            setSessionFilePath: () => undefined,
        });

        await harness.manager.attachSession({ piSessionId });
        const history = harness.manager.getHistory(piSessionId);

        const userEntry = history.find((e) => e.kind === "user");
        const assistantEntry = history.find((e) => e.kind === "assistant-text");
        expect(userEntry, "expected user message in restored history").toBeTruthy();
        expect((userEntry as { text: string }).text).toBe("say hi");
        expect(assistantEntry, "expected assistant message in restored history").toBeTruthy();
        expect((assistantEntry as { text: string }).text).toBe("hello world");
    });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/restore.test.ts
```

Expected: 1 passing.

If pi doesn't persist the message file synchronously after `turn_end` — the test may need a brief await before disposing. If so, add `await new Promise((r) => setTimeout(r, 50))` after `drive()` and before disposing. Document any such adjustment.

If pi requires the `agentDir` to match for AuthStorage to find auth (the harness uses an isolated tmp cwd), the attach may need `agentDir` passed through. The harness's `setPathStore` may also need an `agentDir` parameter — adapt as needed and document.

- [ ] **Step 3: Run full suite**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Expected: 63 + 1 = 64 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/pi-integration/restore.test.ts
git commit -m "test(restore): assert attachSession replays history after manager dispose"
```

---

## Phase F — Manual smoke

### Task 10: End-to-end smoke against real Codex auth

This is the user-visible payoff: kill macpi, restart it, click an existing session, see its content, send a new message that works.

- [ ] **Step 1: Confirm Codex auth and that you have a pre-existing session**

```bash
ls ~/.pi/agent/auth.json
ls ~/.pi/agent/sessions/ | head -5
```

Both should return paths.

- [ ] **Step 2: Launch macpi, create a session, send a prompt**

```bash
npm start
```

In the UI: pick (or create) a channel, create a session, send `read the README.md and summarise it`. Wait for it to finish. Note the session ID shown in the chat header.

- [ ] **Step 3: Quit and relaunch**

Close the macpi window completely. Then:

```bash
npm start
```

In the UI: select the same channel, then click on the session you just used.

**Expect:**
- A "Loading session…" placeholder appears briefly.
- The chat populates with the user's prompt and the agent's response — including the tool block for the `read` call (collapsed, color = green).
- No "[ipc error]" banner.

- [ ] **Step 4: Send a follow-up message**

In the now-restored session, send `now also list the files in src/renderer`.

**Expect:**
- The agent responds normally — confirming attach was complete and the session is fully usable, not just visible.

- [ ] **Step 5: Tag**

If steps 3 and 4 both work:

```bash
git tag v0.4-session-restore -m "macpi session restore (lazy attach + history replay)"
```

- [ ] **Step 6: Report**

If anything fails, capture:
- Step number that failed
- Last 30 lines of the `npm start` terminal
- Any DevTools Console errors
- Screenshot of the chat pane state at failure (optional)

---

## Self-review checklist

The plan author has run this checklist. Engineers executing the plan should re-run it after each phase.

- **Spec coverage** (against §8.3 of the design spec — *"On open, renderer requests the current message log from pi-host and renders it; from there, live-updates from events"*):
  - "renderer requests the current message log" → Tasks 5, 6, 8 (IPC + query + ChatPane wiring) ✓
  - "from pi-host" → Task 4 (PiSessionManager.attachSession reads from the SDK) ✓
  - "renders it" → Task 7 (useTimeline accepts initial timeline) + Task 8 (ChatPane wires it) ✓
  - "from there, live-updates from events" → unchanged from Plan 2's PiEvent forwarding ✓
  - Tool-call/result reconstruction → Task 3 (translator) + Task 7's seed mechanism ✓
  - Compaction/branch summary messages → **deferred** (called out in scope section) ✓

- **Placeholder scan**: Searched for "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "similar to Task". No instances in task bodies. The `// TODO` text in T2's diff comment ("populated by PiSessionManager.createSession (T3)") is a forward-reference within the plan, which is OK — the next task does the populating.

- **Type consistency**:
  - `SessionMeta` shape (T2) is consistent with `getMeta`/`setSessionFilePath` callers (T4).
  - `AddArgs` field names (`channelId`, `piSessionId`, `cwd`, `sessionFilePath`) match across T2 and T4 call sites.
  - `PiSessionManager.createSession` return shape `{piSessionId, sessionFilePath}` is consistent between T4 (definition), T4's IPC router update, and T4's ipc-router test mock update.
  - `attachSession({piSessionId})` and `getHistory(piSessionId)` arg shapes match between T4, T5's IPC handler, and T5's mock.
  - `IpcMethods["session.attach"].res.entries` and `ChatPane`'s `attachQuery.data?.entries` are the same `TimelineEntry[]` from `src/renderer/types/timeline`.
  - `useAttachSession(piSessionId: string | null)` matches what ChatPane passes (T8).

- **Cross-task references**:
  - T1 → T2: T2 reads/writes the columns T1 added.
  - T3 (translator) → T4: T4 imports `agentMessagesToTimeline` from `pi-history.ts`.
  - T4 → T5: T5's IPC router calls `manager.attachSession` and `manager.getHistory`.
  - T5 → T6: T6's query calls `invoke("session.attach", ...)`.
  - T6 → T7 → T8: ChatPane (T8) uses `useAttachSession` (T6) and passes the result into `useTimeline` (T7).
  - T9 (layer-3) depends on T4's manager methods being live.

- **Carried-forward items honored**:
  - Pi loaded via dynamic `import()` — T4's `attachSession` uses the existing `loadPi()` helper. ✓
  - Externalization of `@earendil-works/*` — no `vite.main.config.ts` changes. ✓
  - node:sqlite row casts — T2 uses `as unknown as RowType` for every `.all()` and `.get()`. ✓

---

## Done criteria

The session restore milestone is complete when:

1. All tasks 1–10 are committed.
2. `npm test` runs all suites and shows 64 tests passing (49 from end of Plan 3 + 1 migration + 3 channels-repo + 8 pi-history + 2 ipc-router + 1 layer-3 = 64).
3. The Task 10 smoke succeeds at steps 3 and 4 (restore + send-after-restore both work against real Codex auth).
4. Tag `v0.4-session-restore` exists.

After that: pause, review, then either Plan 5 (branching UI — `SessionTreeEvent`, branch-from-message, click-to-switch active branch) or whatever the user prioritises.
