# Thinking Selector and Model List Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current/default thinking selection to chat, split Models into movable favourite/non-favourite sections, and remove the redundant Defaults model search.

**Architecture:** Add one typed session thinking-level operation and a focused `ChatThinkingMenu` that consumes authoritative levels from footer statistics. Keep the existing Models persistence queue intact while changing only its presentation partition, and simplify `DefaultModelSelector` by removing search/filter state.

**Tech Stack:** React 18, TypeScript, TanStack Query, Electron IPC, Pi AgentSession SDK, Vitest/jsdom, Biome.

---

### Task 1: Session thinking-level contract and mutation

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Run impact analysis**

Run GitNexus upstream impact on `IpcMethods`, `IpcRouter`, and `useSessionFooterStats`. Warn and obtain approval before HIGH/CRITICAL edits if not already approved for this task.

- [ ] **Step 2: Write failing IPC tests**

Cover footer statistics levels and thinking changes:

```ts
expect(result.data?.availableThinkingLevels).toEqual(["off", "low", "high"]);
expect(session.setThinkingLevel).toHaveBeenCalledWith("high");
```

Add missing-session, initial streaming, unsupported level, success, and a final streaming guard test where available-level lookup changes streaming state before mutation.

- [ ] **Step 3: Run RED**

Run: `npx vitest --run tests/integration/ipc-router.test.ts`

Expected: FAIL because `session.setThinkingLevel` and footer levels are absent.

- [ ] **Step 4: Add typed IPC and handler**

Add:

```ts
"session.setThinkingLevel": {
  req: { piSessionId: string; level: ThinkingLevel };
  res: Record<string, never>;
};
```

Extend footer stats with `availableThinkingLevels: ThinkingLevel[]`. The handler finds the session, rejects streaming, validates membership in `getAvailableThinkingLevels()`, rechecks streaming, calls synchronous `setThinkingLevel`, and maps not-found/busy/validation failures using existing envelopes.

- [ ] **Step 5: Add renderer mutation**

Add `useSetSessionThinkingLevel`; on success invalidate only `["session.footerStats", piSessionId]`.

- [ ] **Step 6: Verify and commit**

Run focused tests, typecheck, targeted Biome, full tests, diff check, and GitNexus detect-changes.

```bash
git add src/shared/ipc-types.ts src/main/ipc-router.ts src/renderer/queries.ts tests/integration/ipc-router.test.ts
git commit -m "feat: set session thinking level"
```

### Task 2: Clickable thinking menu

**Files:**
- Create: `src/renderer/components/ChatThinkingMenu.tsx`
- Modify: `src/renderer/components/ChatFooter.tsx`
- Create: `tests/unit/chat-thinking-menu.test.ts`
- Modify: `tests/unit/chat-footer.test.ts`

- [ ] **Step 1: Impact-analyze ChatFooter**

Run upstream impact for `ChatFooter`; report the chat flow blast radius before editing.

- [ ] **Step 2: Write failing rendered tests**

Cover supported-level-only rendering, current marker, exact mutation payload, success closure/focus, failure retry context, Escape/outside dismissal, and streaming/pending disabled state:

```ts
expect(optionLabels()).toEqual(["Off", "Low", "High"]);
expect(setThinking.mutateAsync).toHaveBeenCalledWith({
  piSessionId: "pi-1",
  level: "high",
});
```

- [ ] **Step 3: Run RED**

Run: `npx vitest --run tests/unit/chat-thinking-menu.test.ts tests/unit/chat-footer.test.ts`

Expected: FAIL because the menu does not exist.

- [ ] **Step 4: Implement ChatThinkingMenu**

Mirror the proven lifecycle from `ChatModelMenu`: compact trigger, anchored dialog, native option buttons, current indicator, pending guard, error alert, Escape/outside dismissal when idle, and deferred focus restoration after success. Use only `availableThinkingLevels` from footer stats.

- [ ] **Step 5: Compose into ChatFooter**

Replace static thinking markup with:

```tsx
<ChatThinkingMenu
  piSessionId={piSessionId}
  currentLevel={thinkingLevel}
  availableLevels={availableThinkingLevels}
  streaming={streaming}
/>
```

Retain tone styling and compact labels.

- [ ] **Step 6: Verify and commit**

Run focused tests, IPC tests, typecheck, targeted Biome, full tests, and diff check.

```bash
git add src/renderer/components/ChatThinkingMenu.tsx src/renderer/components/ChatFooter.tsx tests/unit/chat-thinking-menu.test.ts tests/unit/chat-footer.test.ts
git commit -m "feat: choose thinking level from chat"
```

### Task 3: Split Models into collapsible sections

**Files:**
- Modify: `src/renderer/components/ModelsSettings.tsx`
- Modify: `tests/unit/models-settings.test.ts`

- [ ] **Step 1: Impact-analyze ModelsSettings**

Run upstream impact and confirm the change remains within the Models settings flow.

- [ ] **Step 2: Write failing rendered tests**

Assert both sections start expanded, favourites and non-favourites are exclusive, counts reflect search, toggling moves rows, disclosures collapse independently, and queue rollback still restores the correct section.

- [ ] **Step 3: Run RED**

Run: `npx vitest --run tests/unit/models-settings.test.ts`

Expected: FAIL because the section controls are absent.

- [ ] **Step 4: Partition visible models**

Derive:

```ts
const favouriteModels = visibleModels.filter((model) => favouriteKeys.has(modelRefKey(...)));
const otherModels = visibleModels.filter((model) => !favouriteKeys.has(modelRefKey(...)));
```

Render independent expanded-by-default disclosure controls labelled `Favourites (N)` and `All models (N)`. Reuse the same row component and `toggleFavourite`, so optimistic moves, serialized writes, rollback, and StrictMode behavior remain unchanged.

- [ ] **Step 5: Verify and commit**

Run focused Models tests, typecheck, targeted Biome, full tests, and diff check.

```bash
git add src/renderer/components/ModelsSettings.tsx tests/unit/models-settings.test.ts
git commit -m "feat: group favourite models"
```

### Task 4: Remove redundant default-model search

**Files:**
- Modify: `src/renderer/components/DefaultModelSelector.tsx`
- Modify: `tests/unit/default-model-selector.test.ts`

- [ ] **Step 1: Write failing simplification test**

Assert no search textbox/label renders, while all configured grouped options, Automatic fallback, selection, unavailable default, loading, pending, and errors remain.

- [ ] **Step 2: Run RED**

Run: `npx vitest --run tests/unit/default-model-selector.test.ts`

Expected: FAIL because Search configured models still renders.

- [ ] **Step 3: Remove search state and filtering**

Delete the search input, search state, filtered models, current-option search exception, and related tests. Build groups directly from configured provider models while preserving the saved unavailable option.

- [ ] **Step 4: Verify and commit**

Run focused defaults/model tests, typecheck, targeted Biome, full tests, and diff check.

```bash
git add src/renderer/components/DefaultModelSelector.tsx tests/unit/default-model-selector.test.ts
git commit -m "refactor: simplify default model selection"
```

### Task 5: Final verification

- [ ] **Step 1: Run complete verification**

Run `npm test`, `npm run typecheck`, targeted/full lint, package build, and `git diff --check main...HEAD`.

- [ ] **Step 2: Run GitNexus change detection**

Run `npx gitnexus detect-changes --scope compare --base-ref main --repo <worktree-path>` and review every affected process.

- [ ] **Step 3: Review against design**

Verify every requirement in `docs/superpowers/specs/2026-07-13-thinking-and-model-list-design.md`, then perform code-quality and accessibility review before integration.
