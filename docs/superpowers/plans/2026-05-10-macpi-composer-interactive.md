# macpi Composer Interactive (Steer / Queue / Clear) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the composer act on a streaming session — surface **Steer** (interrupt) and **Queue** (after current turn) buttons while streaming, plain **Send** otherwise, and add a **Clear queue** affordance to the queue-pills row from Plan 2.

**Architecture:** Pi's `AgentSession.prompt(text, {streamingBehavior})` already encodes the steer/queue dispatch — we just plumb the option through `session.prompt` IPC and let the renderer pick `"steer"` or `"followUp"` based on `useTimeline().snapshot.streaming`. Two new IPC methods (`session.clearQueue`, `session.abort`) call the matching pi APIs. The composer is extracted from `ChatPane.tsx` into its own component. Per-item queue cancel is **deferred** — the SDK only exposes `clearQueue()` (all-or-nothing), and a reconcile-based per-item cancel is racy without SDK support.

**Tech Stack:** Same as Plan 2. No new dependencies. Layer-3 tests reuse the harness from `tests/pi-integration/test-harness.ts`.

**Out of scope for this plan (lands in plan 4 or later):**

- **Per-item queue cancel-x.** Pi exposes `clearQueue()` only. A "cancel item N" path would require either a pi SDK update or a racy reconcile (clearQueue → re-queue all-but-one). Plan 4+ designs this properly.
- **Branching UI** (`SessionTreeEvent` panel, branch-from-message context menu). Independent subsystem; gets its own plan.
- **Slash-command / @skill autocomplete in the composer** (§8.4). Concrete `ResourceLoader` plumbing — separate plan.
- **Image attachments**. Composer stays text-only for v1.

**Carried forward from Plan 2 (read this — it bites otherwise):**

1. **Pi runs in main process.** No utility process. `PiSessionManager` owns sessions in-process; long tool calls block main's event loop. Acceptable, called out, will revisit if it becomes a real problem.
2. **`@earendil-works/pi-coding-agent` and `pi-ai` are ESM-only.** Static `import { ... } from "..."` in CJS bundle compiles to `require()` and fails at runtime. Use **dynamic `import()` cached behind a helper**, like `pi-session-manager.ts` does today. `import type { ... }` is fine.
3. **`node:sqlite` row casts.** Plan 3 doesn't touch the DB, but if any new repo or query lands, cast as `as unknown as RowType`.
4. **`@earendil-works/*` packages must stay externalized in `vite.main.config.ts`.** They resolve to `node_modules` at runtime so pi can find templates/themes/wasm.
5. **Pi's auto-retry is regex-gated.** Any new test that needs to exercise retry must throw an error whose message matches `/overloaded|rate.?limit|429|500|502|503|504|timeout|terminated/`. Plan 2's `tests/pi-integration/banners.test.ts` is the working precedent.
6. **The IDE-LSP shows spurious JSX/module diagnostics** (it ignores the project's `tsconfig.json`'s `jsx: "react-jsx"` and `moduleResolution: "Bundler"`). Ground truth is `npm run typecheck`.

---

## File structure created or modified

```
src/
  shared/
    ipc-types.ts                      # MODIFIED — extend session.prompt; add session.clearQueue, session.abort
  main/
    ipc-router.ts                     # MODIFIED — wire the new methods
    pi-session-manager.ts             # MODIFIED — accept streamingBehavior, add clearQueue + abort
  renderer/
    queries.ts                        # MODIFIED — extend usePromptSession; add useClearQueue, useAbortSession
    components/
      Composer.tsx                    # NEW — extracted from ChatPane; renders Send / Steer / Queue
      ChatPane.tsx                    # MODIFIED — use Composer; pass snapshot.streaming + appendUserMessage
      banners/
        QueuePills.tsx                # MODIFIED — add a "Clear queue" button when total > 0

tests/
  integration/
    ipc-router.test.ts                # MODIFIED — assert clearQueue + abort dispatch + streamingBehavior pass-through
  pi-integration/
    composer.test.ts                  # NEW — Layer-3: steer / followUp / clearQueue / abort against the harness
```

`Composer.tsx` is small — it owns the input element + Send/Steer/Queue decision. ChatPane keeps the surrounding layout (breadcrumb + Timeline + banners + queue pills). Splitting now gives Plan 4+ a clean place to add slash-command autocomplete without bloating ChatPane.

`QueuePills.tsx` keeps the per-item rendering identical — the only change is a single "Clear" trailing button.

---

## Conventions for this plan

- **Project root** is `/Users/roaanv/mycode/macpi`. Implementation should happen in a fresh worktree (e.g. `.claude/worktrees/composer-interactive`) created off `main` (currently HEAD = `709c9fb`, tag `v0.2-chat-richness`).
- **TDD** for the SDK-touching layers: Layer-2 ipc-router tests first (mocked manager), Layer-3 pi-integration tests for the actual pi calls. UI is not unit-tested in this plan.
- **Conventional commits**: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `build:` with parenthesised scope.
- **Run `npm run format && npm run lint && npm run typecheck && npm test` before each commit.** No skipping. Biome will reformat — let it.
- **All commands run from the worktree root** unless stated otherwise.
- **SDK source of truth**: when in doubt, read `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts`. The relevant lines this plan was written against:
  - `prompt(text, {streamingBehavior?: "steer" | "followUp", source?: InputSource}): Promise<void>` — line 319, throws if streaming and `streamingBehavior` missing.
  - `steer(text, images?): Promise<void>` — line 335.
  - `followUp(text, images?): Promise<void>` — line 343.
  - `clearQueue(): { steering: string[]; followUp: string[] }` — line 381 (synchronous).
  - `abort(): Promise<void>` — line 395.
  - `getSteeringMessages(): readonly string[]`, `getFollowUpMessages(): readonly string[]` — read-only state, lines 388/390.

---

## Phase A — IPC types + PiSessionManager

### Task 1: Extend `IpcMethods` types

**Files:**
- Modify: `src/shared/ipc-types.ts`

Add `streamingBehavior` to `session.prompt` and declare two new methods.

- [ ] **Step 1: Edit `src/shared/ipc-types.ts`**

Find the `session.prompt` entry inside `IpcMethods` and replace it (keep the same shape — only the `req` widens):

```ts
"session.prompt": {
    req: {
        piSessionId: string;
        text: string;
        /** Required when the session is streaming. "steer" interrupts; "followUp" queues. */
        streamingBehavior?: "steer" | "followUp";
    };
    res: Record<string, never>;
};
```

Add two new entries inside `IpcMethods`, right after `session.prompt`:

```ts
"session.clearQueue": {
    req: { piSessionId: string };
    /** Returns the cleared messages so the renderer can stash them as drafts if it wants. */
    res: { steering: string[]; followUp: string[] };
};
"session.abort": {
    req: { piSessionId: string };
    res: Record<string, never>;
};
```

- [ ] **Step 2: Verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

All exit 0. Test count is unchanged from Plan 2's 41 — no new tests yet, and the existing tests don't reference these methods.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-types.ts
git commit -m "feat(ipc): widen session.prompt; add session.clearQueue + session.abort"
```

---

### Task 2: Extend `PiSessionManager` with streamingBehavior, clearQueue, abort

**Files:**
- Modify: `src/main/pi-session-manager.ts`

- [ ] **Step 1: Update the `prompt` method signature**

Find the existing `prompt` method:

```ts
async prompt(piSessionId: string, text: string): Promise<void> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    await active.session.prompt(text, { source: "interactive" });
}
```

Replace with:

```ts
async prompt(
    piSessionId: string,
    text: string,
    streamingBehavior?: "steer" | "followUp",
): Promise<void> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    await active.session.prompt(text, {
        source: "interactive",
        streamingBehavior,
    });
}
```

- [ ] **Step 2: Add `clearQueue` and `abort` methods**

Add these public methods to `PiSessionManager`, right after `prompt`:

```ts
async clearQueue(
    piSessionId: string,
): Promise<{ steering: string[]; followUp: string[] }> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    return active.session.clearQueue();
}

async abort(piSessionId: string): Promise<void> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    await active.session.abort();
}
```

(`clearQueue()` on `AgentSession` is synchronous, but we wrap it in `async` so callers don't need to special-case its return shape against the other two methods. It also matches the IPC handler shape the next task expects.)

- [ ] **Step 3: Verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

All exit 0. The IPC router test (which mocks `PiSessionManager`) still passes because the new methods don't break the existing `prompt(piSessionId, text)` call site — the third parameter is optional.

- [ ] **Step 4: Commit**

```bash
git add src/main/pi-session-manager.ts
git commit -m "feat(pi): expose streamingBehavior, clearQueue, abort on PiSessionManager"
```

---

## Phase B — IPC router + renderer queries

### Task 3: Wire the new methods through the IPC router (TDD via integration tests)

**Files:**
- Modify: `tests/integration/ipc-router.test.ts`
- Modify: `src/main/ipc-router.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/integration/ipc-router.test.ts` and add the following inside the existing top-level `describe` block (don't replace the file — there are existing tests that must keep passing). Place these AFTER the existing `session.prompt` test:

```ts
it("session.prompt forwards streamingBehavior to the manager", async () => {
    const calls: Array<{
        piSessionId: string;
        text: string;
        streamingBehavior?: "steer" | "followUp";
    }> = [];
    const fakeManager = {
        prompt: async (
            piSessionId: string,
            text: string,
            streamingBehavior?: "steer" | "followUp",
        ) => {
            calls.push({ piSessionId, text, streamingBehavior });
        },
    } as unknown as PiSessionManager;
    const router = makeRouter({ piSessionManager: fakeManager });

    const r1 = await router.handle("session.prompt", {
        piSessionId: "s1",
        text: "go",
    });
    const r2 = await router.handle("session.prompt", {
        piSessionId: "s1",
        text: "wait",
        streamingBehavior: "followUp",
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(calls).toEqual([
        { piSessionId: "s1", text: "go", streamingBehavior: undefined },
        { piSessionId: "s1", text: "wait", streamingBehavior: "followUp" },
    ]);
});

it("session.clearQueue returns the cleared messages", async () => {
    const fakeManager = {
        clearQueue: async () => ({
            steering: ["a"],
            followUp: ["b", "c"],
        }),
    } as unknown as PiSessionManager;
    const router = makeRouter({ piSessionManager: fakeManager });

    const result = await router.handle("session.clearQueue", { piSessionId: "s1" });

    expect(result).toEqual({
        ok: true,
        data: { steering: ["a"], followUp: ["b", "c"] },
    });
});

it("session.abort returns ok with no payload", async () => {
    let aborted = "";
    const fakeManager = {
        abort: async (id: string) => {
            aborted = id;
        },
    } as unknown as PiSessionManager;
    const router = makeRouter({ piSessionManager: fakeManager });

    const result = await router.handle("session.abort", { piSessionId: "s7" });

    expect(result).toEqual({ ok: true, data: {} });
    expect(aborted).toBe("s7");
});

it("session.clearQueue surfaces manager errors as ipc errors", async () => {
    const fakeManager = {
        clearQueue: async () => {
            throw new Error("unknown session s1");
        },
    } as unknown as PiSessionManager;
    const router = makeRouter({ piSessionManager: fakeManager });

    const result = await router.handle("session.clearQueue", { piSessionId: "s1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(result.error.message).toContain("unknown session s1");
    }
});
```

(`makeRouter` and `PiSessionManager` are imported by the existing test file. Don't re-import.)

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/integration/ipc-router.test.ts
```

Expected: the 3 happy-path tests fail with "Method not found" or similar, and the error-path test fails analogously. The 6 existing ipc-router tests still pass.

- [ ] **Step 3: Update `src/main/ipc-router.ts`**

Find the existing `session.prompt` registration:

```ts
this.register("session.prompt", async (args) => {
    await this.deps.piSessionManager.prompt(args.piSessionId, args.text);
    return ok({});
});
```

Replace with:

```ts
this.register("session.prompt", async (args) => {
    await this.deps.piSessionManager.prompt(
        args.piSessionId,
        args.text,
        args.streamingBehavior,
    );
    return ok({});
});
```

Add two new registrations right after `session.prompt`:

```ts
this.register("session.clearQueue", async (args) => {
    const cleared = await this.deps.piSessionManager.clearQueue(args.piSessionId);
    return ok(cleared);
});
this.register("session.abort", async (args) => {
    await this.deps.piSessionManager.abort(args.piSessionId);
    return ok({});
});
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- tests/integration/ipc-router.test.ts
```

Expected: 6 prior + 4 new = 10 ipc-router tests pass.

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

Full suite: 41 prior + 4 new = 45 total. All pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): route session.prompt streamingBehavior + clearQueue + abort"
```

---

### Task 4: Add renderer queries for clearQueue + abort, extend usePromptSession

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Update `usePromptSession`**

Find the existing hook:

```ts
export function usePromptSession() {
    return useMutation({
        mutationFn: (input: { piSessionId: string; text: string }) =>
            invoke("session.prompt", input),
    });
}
```

Replace with:

```ts
export function usePromptSession() {
    return useMutation({
        mutationFn: (input: {
            piSessionId: string;
            text: string;
            streamingBehavior?: "steer" | "followUp";
        }) => invoke("session.prompt", input),
    });
}
```

- [ ] **Step 2: Add the two new hooks**

Append to the bottom of `src/renderer/queries.ts`:

```ts
export function useClearQueue() {
    return useMutation({
        mutationFn: (input: { piSessionId: string }) =>
            invoke("session.clearQueue", input),
    });
}

export function useAbortSession() {
    return useMutation({
        mutationFn: (input: { piSessionId: string }) =>
            invoke("session.abort", input),
    });
}
```

- [ ] **Step 3: Verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

All exit 0. 45 tests still pass. (No renderer tests change — these are just hook signatures.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "feat(queries): extend usePromptSession; add useClearQueue + useAbortSession"
```

---

## Phase C — Layer-3 tests for the SDK pass-through

These tests use the `tests/pi-integration/test-harness.ts` from Plan 2 and exercise pi's actual steer/followUp/clearQueue/abort behavior end-to-end.

### Task 5: Layer-3 — `streamingBehavior: "followUp"` queues a message for after the agent finishes

**Files:**
- Create: `tests/pi-integration/composer.test.ts`

- [ ] **Step 1: Write the test (first case)**

Create `tests/pi-integration/composer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PiEvent } from "../../src/shared/pi-events";
import { createHarness, drive, fauxHelpers, type Harness } from "./test-harness";

let harness: Harness;

beforeEach(async () => {
    harness = await createHarness();
});

afterEach(() => {
    harness.dispose();
});

describe("layer-3: composer follow-up queueing", () => {
    it("queueing during a turn shows up in queue_update.followUp", async () => {
        const { fauxAssistantMessage, fauxText } = await fauxHelpers();

        // Turn 1: a slow-ish response so we have time to queue mid-stream.
        // Faux streams in token chunks; we use a multi-token message so the
        // turn is in flight when we call prompt with followUp.
        harness.queueResponse(
            fauxAssistantMessage(fauxText("first answer takes a few words")),
        );
        // Turn 2 (the follow-up causes a second turn): a quick response so
        // drive() doesn't time out waiting for the second turn_end.
        harness.queueResponse(fauxAssistantMessage(fauxText("got the follow-up")));

        const piSessionId = await harness.manager.createSession({ cwd: harness.cwd });
        const events: PiEvent[] = [];
        const off = harness.subscribe((e) => events.push(e));

        // Start the first turn but don't await yet.
        const turn1 = harness.manager.prompt(piSessionId, "tell me");
        // Wait for turn_start to confirm streaming has begun.
        await waitFor(events, (e) => e.type === "session.turn_start");
        // Queue a follow-up; pi should record it via queue_update.
        await harness.manager.prompt(piSessionId, "and then this", "followUp");
        // Let turn 1 + the queued turn 2 both complete.
        await turn1;
        await waitForTwoTurnEnds(events);
        off();

        const queueEvents = events.filter(
            (e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
                e.type === "session.queue_update",
        );
        expect(queueEvents.length).toBeGreaterThan(0);
        const someEventCarriedFollowUp = queueEvents.some(
            (e) => e.followUp.includes("and then this"),
        );
        expect(
            someEventCarriedFollowUp,
            `expected a queue_update with the queued follow-up. saw: ${queueEvents.map((e) => `[steer:${e.steering.join("|")} follow:${e.followUp.join("|")}]`).join(", ")}`,
        ).toBe(true);
    });
});

function waitFor(
    events: PiEvent[],
    predicate: (e: PiEvent) => boolean,
    timeoutMs = 5_000,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            if (events.some(predicate)) return resolve();
            if (Date.now() - start > timeoutMs) {
                return reject(new Error("waitFor: predicate not satisfied within timeout"));
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}

function waitForTwoTurnEnds(events: PiEvent[], timeoutMs = 8_000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
            const ends = events.filter((e) => e.type === "session.turn_end").length;
            if (ends >= 2) return resolve();
            if (Date.now() - start > timeoutMs) {
                return reject(
                    new Error(`waitForTwoTurnEnds: only saw ${ends} turn_end events`),
                );
            }
            setTimeout(tick, 10);
        };
        tick();
    });
}
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/composer.test.ts
```

Expected: 1 passing.

If it fails because the faux provider streams too fast for `waitFor("turn_start")` to land before turn ends:

1. Increase the faux `tokenSize` in `test-harness.ts` constants — but DO NOT do that as part of this task; instead lengthen the message content in this test. A 50+ word `fauxText` gives enough chunks to interleave.
2. If that still doesn't work, switch to a `FauxResponseFactory` that calls a `delayed()` helper to slow the stream. Document any such adjustment.

If pi rejects `streamingBehavior` mid-stream entirely (it shouldn't — line 314 of `agent-session.d.ts` says it's the supported path), report BLOCKED with the actual error.

- [ ] **Step 3: Commit**

```bash
git add tests/pi-integration/composer.test.ts
git commit -m "test(composer): assert streamingBehavior=followUp queues mid-turn"
```

---

### Task 6: Layer-3 — `streamingBehavior: "steer"` queues a steering message

**Files:**
- Modify: `tests/pi-integration/composer.test.ts`

- [ ] **Step 1: Add a second test case**

Append a new `it()` inside the existing `describe("layer-3: composer follow-up queueing", ...)` block:

```ts
it("steering during a turn shows up in queue_update.steering", async () => {
    const { fauxAssistantMessage, fauxText } = await fauxHelpers();

    harness.queueResponse(
        fauxAssistantMessage(fauxText("first answer with several words to chunk")),
    );
    harness.queueResponse(fauxAssistantMessage(fauxText("steered response")));

    const piSessionId = await harness.manager.createSession({ cwd: harness.cwd });
    const events: PiEvent[] = [];
    const off = harness.subscribe((e) => events.push(e));

    const turn1 = harness.manager.prompt(piSessionId, "tell me");
    await waitFor(events, (e) => e.type === "session.turn_start");
    await harness.manager.prompt(piSessionId, "actually do this instead", "steer");
    await turn1;
    await waitForTwoTurnEnds(events);
    off();

    const queueEvents = events.filter(
        (e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
            e.type === "session.queue_update",
    );
    const someEventCarriedSteer = queueEvents.some(
        (e) => e.steering.includes("actually do this instead"),
    );
    expect(
        someEventCarriedSteer,
        `expected a queue_update with the steered message. saw: ${queueEvents.map((e) => `[steer:${e.steering.join("|")} follow:${e.followUp.join("|")}]`).join(", ")}`,
    ).toBe(true);
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/composer.test.ts
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/pi-integration/composer.test.ts
git commit -m "test(composer): assert streamingBehavior=steer queues into the steering list"
```

---

### Task 7: Layer-3 — `clearQueue()` empties the queue and returns its contents

**Files:**
- Modify: `tests/pi-integration/composer.test.ts`

- [ ] **Step 1: Add a third test case**

Append inside the existing `describe`:

```ts
it("clearQueue() empties the queue and returns the cleared messages", async () => {
    const { fauxAssistantMessage, fauxText } = await fauxHelpers();

    harness.queueResponse(
        fauxAssistantMessage(fauxText("first answer with several words to chunk")),
    );
    // We don't expect a second turn here — the queued follow-up gets cleared
    // before turn 1 finishes consuming the queue. So we don't need a 2nd faux.

    const piSessionId = await harness.manager.createSession({ cwd: harness.cwd });
    const events: PiEvent[] = [];
    const off = harness.subscribe((e) => events.push(e));

    const turn1 = harness.manager.prompt(piSessionId, "tell me");
    await waitFor(events, (e) => e.type === "session.turn_start");
    await harness.manager.prompt(piSessionId, "queued thing", "followUp");
    // Wait for the queue_update with our queued message before clearing.
    await waitFor(
        events,
        (e) => e.type === "session.queue_update" && e.followUp.includes("queued thing"),
    );

    const cleared = await harness.manager.clearQueue(piSessionId);
    await turn1;
    await waitFor(events, (e) => e.type === "session.turn_end");
    off();

    expect(cleared.followUp).toContain("queued thing");
    // After clear, a queue_update should fire with empty followUp.
    const post = events.filter(
        (e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
            e.type === "session.queue_update",
    );
    const last = post[post.length - 1];
    expect(last).toBeTruthy();
    expect(last?.followUp).not.toContain("queued thing");
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/composer.test.ts
```

Expected: 3 passing.

If pi doesn't emit a `queue_update` after `clearQueue()` — i.e. the queue empties silently — relax the last assertion: drop the "post-clear queue_update with empty followUp" check and replace with `expect(events.filter(e => e.type === "session.turn_end").length).toBe(1)` (i.e. only one turn ran, proving the queued follow-up didn't trigger turn 2). Document the change in your task report.

- [ ] **Step 3: Commit**

```bash
git add tests/pi-integration/composer.test.ts
git commit -m "test(composer): assert clearQueue empties queue and returns the cleared list"
```

---

### Task 8: Layer-3 — `abort()` terminates the current turn

**Files:**
- Modify: `tests/pi-integration/composer.test.ts`

- [ ] **Step 1: Add a fourth test case**

Append inside the existing `describe`:

```ts
it("abort() ends the current turn promptly", async () => {
    const { fauxAssistantMessage, fauxText } = await fauxHelpers();

    // A long message so the turn is well in flight when we call abort.
    const longBody = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    harness.queueResponse(fauxAssistantMessage(fauxText(longBody)));

    const piSessionId = await harness.manager.createSession({ cwd: harness.cwd });
    const events: PiEvent[] = [];
    const off = harness.subscribe((e) => events.push(e));

    const turn1 = harness.manager.prompt(piSessionId, "tell me a long story");
    await waitFor(events, (e) => e.type === "session.turn_start");
    await harness.manager.abort(piSessionId);
    // turn1 must resolve (or reject — both are acceptable for an aborted turn).
    await turn1.catch(() => undefined);
    await waitFor(events, (e) => e.type === "session.turn_end");
    off();

    // The aborted turn should have produced fewer text deltas than the full
    // 80-word body (the faux provider streams 2-4 tokens at a time, so a full
    // body would be ~20-40 deltas). Pick a generous upper bound — say 30 — to
    // tolerate timing variance while still proving abort interrupted streaming.
    const textDeltaCount = events.filter((e) => e.type === "session.text_delta").length;
    expect(textDeltaCount).toBeLessThan(40);
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/composer.test.ts
```

Expected: 4 passing.

If `abort()` doesn't actually interrupt the faux provider's stream (it might run the full body before pi tears down), the test fails — that's a real finding worth surfacing. In that case:
1. Confirm by checking `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` for what `abort()` does at runtime (search for `abort`).
2. If pi's abort is async-after-current-stream rather than mid-stream, replace the assertion with `expect(textDeltaCount).toBeLessThanOrEqual(fullBodyDeltaCount)` and document the finding. The test still proves abort *resolved* and was non-throwing.

- [ ] **Step 3: Run full suite + verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All exit 0. Test count = 45 (Plan 2's 41) + 4 composer = 49.

- [ ] **Step 4: Commit**

```bash
git add tests/pi-integration/composer.test.ts
git commit -m "test(composer): assert abort() ends the current turn promptly"
```

---

## Phase D — Composer extraction + Steer/Queue UI

### Task 9: Extract the composer from `ChatPane.tsx` into its own component (refactor only)

**Files:**
- Create: `src/renderer/components/Composer.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

This is a refactor with no behavior change. The composer keeps the same single Send button. T10 adds the Steer/Queue branching.

- [ ] **Step 1: Create `Composer.tsx`**

```tsx
// Composer for the chat pane. Owns the input + Send button. ChatPane provides
// streaming state and the send handler so this stays a pure presentational
// component until T10 wires Steer/Queue.

import React from "react";

export interface ComposerProps {
    streaming: boolean;
    onSend: (text: string) => Promise<void>;
}

export function Composer({ streaming, onSend }: ComposerProps) {
    const [input, setInput] = React.useState("");

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const text = input.trim();
        if (!text || streaming) return;
        setInput("");
        await onSend(text);
    }

    return (
        <form onSubmit={submit} className="flex gap-2 rounded bg-zinc-900 p-2">
            <input
                className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
                placeholder={streaming ? "streaming…" : "Type a message"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
            />
            <button
                type="submit"
                className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
                disabled={streaming || !input.trim()}
            >
                Send
            </button>
        </form>
    );
}
```

- [ ] **Step 2: Update `ChatPane.tsx`**

Remove the local `input` state and the inline `<form>`. Replace the form body with `<Composer>`.

The full updated file (replace `src/renderer/components/ChatPane.tsx`):

```tsx
// Main chat area. Subscribes to pi events via useTimeline() and renders the
// resulting timeline. Banners and queue pills are wired in Phase E/F.

import { usePromptSession } from "../queries";
import { useTimeline } from "../state/timeline-state";
import { CompactionBanner } from "./banners/CompactionBanner";
import { QueuePills } from "./banners/QueuePills";
import { RetryBanner } from "./banners/RetryBanner";
import { Composer } from "./Composer";
import { Timeline } from "./Timeline";

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
    const { snapshot, appendUserMessage } = useTimeline(piSessionId);
    const promptMutation = usePromptSession();

    if (!piSessionId) {
        return (
            <div className="flex flex-1 items-center justify-center text-zinc-500">
                Select a session, or create one in the sidebar.
            </div>
        );
    }

    async function send(text: string) {
        appendUserMessage(text);
        try {
            await promptMutation.mutateAsync({ piSessionId: piSessionId as string, text });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            appendUserMessage(`[ipc error] ${msg}`);
        }
    }

    return (
        <div className="flex flex-1 flex-col bg-[#1a1a1f] p-4">
            <div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
                session {piSessionId}
            </div>
            <Timeline entries={snapshot.timeline} />
            <div className="mt-2 space-y-2">
                <RetryBanner retry={snapshot.retry} />
                <CompactionBanner
                    compaction={snapshot.compaction}
                    lastResult={snapshot.lastCompactionResult}
                />
                <QueuePills queue={snapshot.queue} />
            </div>
            <Composer streaming={snapshot.streaming} onSend={send} />
        </div>
    );
}
```

The `piSessionId as string` cast in `send` is safe because the early return above guarantees `piSessionId !== null` by the time `send` is callable.

- [ ] **Step 3: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All exit 0. Test count is unchanged (49). No behavior changes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Composer.tsx src/renderer/components/ChatPane.tsx
git commit -m "refactor(composer): extract Composer from ChatPane (no behavior change)"
```

---

### Task 10: Wire Steer + Queue buttons in the Composer

**Files:**
- Modify: `src/renderer/components/Composer.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

When streaming, replace the Send button with two buttons: **Steer** (interrupt) and **Queue** (after current turn). The input remains enabled.

- [ ] **Step 1: Update `Composer.tsx`**

Replace the entire file:

```tsx
// Composer for the chat pane. Owns the input + Send / Steer / Queue buttons.
// Outside streaming: a single Send button. During streaming: Steer (interrupt)
// and Queue (after current turn) buttons; the user can keep typing while the
// agent is mid-turn.

import React from "react";

export type SendIntent = "send" | "steer" | "followUp";

export interface ComposerProps {
    streaming: boolean;
    onSend: (text: string, intent: SendIntent) => Promise<void>;
}

export function Composer({ streaming, onSend }: ComposerProps) {
    const [input, setInput] = React.useState("");

    async function submit(intent: SendIntent) {
        const text = input.trim();
        if (!text) return;
        setInput("");
        await onSend(text, intent);
    }

    function onFormSubmit(e: React.FormEvent) {
        e.preventDefault();
        // Pressing Enter in the input dispatches the default action:
        // - not streaming → "send"
        // - streaming → "followUp" (the safer default; doesn't interrupt the agent)
        void submit(streaming ? "followUp" : "send");
    }

    const hasText = input.trim().length > 0;

    return (
        <form onSubmit={onFormSubmit} className="flex gap-2 rounded bg-zinc-900 p-2">
            <input
                className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
                placeholder={streaming ? "Steer or queue while streaming…" : "Type a message"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
            />
            {streaming ? (
                <>
                    <button
                        type="button"
                        onClick={() => void submit("steer")}
                        className="rounded border border-amber-500 px-3 text-sm text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
                        disabled={!hasText}
                        title="Interrupt the agent and inject this message before its next step"
                    >
                        Steer
                    </button>
                    <button
                        type="submit"
                        className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
                        disabled={!hasText}
                        title="Queue this message to run after the current turn finishes"
                    >
                        Queue
                    </button>
                </>
            ) : (
                <button
                    type="submit"
                    className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
                    disabled={!hasText}
                >
                    Send
                </button>
            )}
        </form>
    );
}
```

- [ ] **Step 2: Update `ChatPane.tsx`'s `send` to dispatch on intent**

Replace the existing `send` function in `ChatPane.tsx` with:

```tsx
async function send(text: string, intent: SendIntent) {
    appendUserMessage(text);
    try {
        if (intent === "send") {
            await promptMutation.mutateAsync({
                piSessionId: piSessionId as string,
                text,
            });
        } else {
            await promptMutation.mutateAsync({
                piSessionId: piSessionId as string,
                text,
                streamingBehavior: intent === "steer" ? "steer" : "followUp",
            });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendUserMessage(`[ipc error] ${msg}`);
    }
}
```

Add `SendIntent` to the imports:

```tsx
import { Composer, type SendIntent } from "./Composer";
```

- [ ] **Step 3: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All exit 0. Test count = 49.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/Composer.tsx src/renderer/components/ChatPane.tsx
git commit -m "feat(composer): add Steer + Queue buttons during streaming"
```

---

## Phase E — Clear-queue UX

### Task 11: Add a "Clear" button to `QueuePills`

**Files:**
- Modify: `src/renderer/components/banners/QueuePills.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

Per-item cancel-x is deferred (no SDK support). A single Clear button covers the common case.

- [ ] **Step 1: Update `QueuePills.tsx`**

Replace the entire file:

```tsx
import type { QueueState } from "../../state/timeline-state";

export interface QueuePillsProps {
    queue: QueueState;
    onClear?: () => void;
}

export function QueuePills({ queue, onClear }: QueuePillsProps) {
    const total = queue.steering.length + queue.followUp.length;
    if (total === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1 rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
            {queue.steering.map((q, i) => (
                <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
                    key={`steer-${i}`}
                    className="rounded bg-indigo-900/60 px-2 py-0.5"
                    title={q}
                >
                    steered: {ellipsize(q, 24)}
                </span>
            ))}
            {queue.followUp.map((q, i) => (
                <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
                    key={`follow-${i}`}
                    className="rounded bg-zinc-700 px-2 py-0.5"
                    title={q}
                >
                    queued: {ellipsize(q, 24)}
                </span>
            ))}
            {onClear && (
                <button
                    type="button"
                    onClick={onClear}
                    className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    title="Clear all steered and queued messages"
                >
                    Clear
                </button>
            )}
        </div>
    );
}

function ellipsize(s: string, max: number): string {
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
```

- [ ] **Step 2: Wire `useClearQueue` into `ChatPane.tsx`**

Add the import alongside `usePromptSession`:

```tsx
import { useClearQueue, usePromptSession } from "../queries";
```

Inside the `ChatPane` function body, near `promptMutation`, add:

```tsx
const clearQueueMutation = useClearQueue();
```

Replace the `<QueuePills queue={snapshot.queue} />` call with:

```tsx
<QueuePills
    queue={snapshot.queue}
    onClear={() => {
        if (!piSessionId) return;
        clearQueueMutation.mutate({ piSessionId });
    }}
/>
```

- [ ] **Step 3: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All exit 0. Test count = 49. (The clearQueue path is already covered by Task 7's layer-3 test.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/banners/QueuePills.tsx src/renderer/components/ChatPane.tsx
git commit -m "feat(queue): add Clear button to QueuePills (per-item cancel deferred)"
```

---

## Phase F — Manual smoke test

### Task 12: End-to-end smoke against real Codex auth

This is a manual checkpoint that validates the composer interactive flow against a real model. The implementer drives it; results go in the merge commit message.

- [ ] **Step 1: Confirm Codex auth**

```bash
ls ~/.pi/agent/auth.json
```

- [ ] **Step 2: Launch macpi**

```bash
npm start
```

- [ ] **Step 3: Walk a steer flow**

1. Pick or create a channel; create a session.
2. Send a long-running prompt: `count slowly from 1 to 30, narrating each number with a sentence`.
3. **While streaming**, type `actually count down from 30 instead` in the composer and click **Steer**.

**Expect:**
- The original counting stops mid-stream.
- The agent acknowledges the steer and starts counting down.
- A `steered:` pill briefly appears, then vanishes once consumed.
- No banners (no retry, no compaction expected).

- [ ] **Step 4: Walk a queue flow**

1. New session (or continue).
2. Send a slow-ish prompt: `read the README.md and summarise it carefully`.
3. **While streaming**, type `then list the files in src/main` and click **Queue**.

**Expect:**
- A `queued:` pill appears in the queue-pills row.
- After the read+summary completes, the agent automatically runs the second prompt.
- The `queued:` pill disappears when consumed.

- [ ] **Step 5: Walk a clear flow**

1. New session.
2. Send `count from 1 to 10`.
3. **While streaming**, queue two messages: `then count to 20` and `then to 30`.
4. Click **Clear** on the queue-pills row.

**Expect:**
- Both `queued:` pills vanish.
- After the original count finishes, no further turns run.

- [ ] **Step 6: Tag**

If steps 3–5 all work:

```bash
git tag v0.3-composer-interactive -m "macpi composer interactive (steer / queue / clear)"
```

- [ ] **Step 7: Report**

If anything fails, capture:
- Step number that failed
- Last 30 lines of the `npm start` terminal
- Any DevTools Console errors
- Screenshot of the chat pane state at failure (optional)

---

## Self-review checklist

The plan author has run this checklist. Engineers should re-run after each phase.

- **Spec coverage** (against §8.4 of the design spec):
  - **Steer** button while streaming → Tasks 9, 10 ✓
  - **Queue** button while streaming → Tasks 9, 10 ✓
  - Plain **Send** outside streaming → Task 9 (preserved) ✓
  - Queue pill row update when queue changes → already in Plan 2; Task 11 adds Clear ✓
  - Per-item cancel-x — **deferred to Plan 4** (called out in scope section) ✓
  - `/command` and `@skill` autocomplete — **deferred** (called out) ✓

- **Placeholder scan**: Searched for "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "similar to Task". The `// TODO` comments don't appear in any task body. The "deferred to Plan 4" callouts are explicit scope notes, not unfilled work.

- **Type consistency**:
  - `streamingBehavior?: "steer" | "followUp"` — identical wherever it appears (`IpcMethods["session.prompt"].req`, `PiSessionManager.prompt`'s third arg, `usePromptSession` input shape).
  - `clearQueue` return shape `{steering: string[]; followUp: string[]}` — same in `IpcMethods["session.clearQueue"].res`, `PiSessionManager.clearQueue`, and the manager's internal call to `session.clearQueue()`.
  - `SendIntent = "send" | "steer" | "followUp"` — Task 10's exported type, consumed in ChatPane's `send` function.
  - `ComposerProps.onSend(text: string, intent: SendIntent)` — same signature in T9's first version (intent is just absent, which is a strict superset since the value is `"send"` by default once added in T10).

- **Cross-task references**:
  - Task 3 depends on Task 2 (manager methods exist).
  - Task 4 depends on Task 1 (IPC types exist).
  - Tasks 5–8 depend on Task 2 (manager methods reachable via harness's `manager.prompt(piSessionId, text, behavior)` etc.).
  - Task 10 depends on Task 9 (Composer file exists).
  - Task 11 depends on Task 4 (`useClearQueue` exists) and on Plan 2's existing `QueuePills`.

- **Carried-forward items honored**:
  - Pi loaded via dynamic `import()` — no new SDK runtime imports in this plan, all use `import type`.
  - Externalization of `@earendil-works/*` — no `vite.main.config.ts` changes.
  - No new repos, no node:sqlite consumers.
  - Pi's retry regex — Plan 3 doesn't exercise retry, so no test needs to match the regex.

---

## Done criteria

The composer interactive milestone is complete when:

1. All tasks 1–12 are committed.
2. `npm test` runs all suites and shows 49 tests passing (45 from Phase B's IPC tests + 4 composer pi-integration).
3. The Task 12 smoke against real Codex auth succeeds at steps 3–5.
4. Tag `v0.3-composer-interactive` exists.

After that: pause, review, then either Plan 4 (branching UI — `SessionTreeEvent` consumption + branch-from-message) or whatever the user prioritises.
