# OAuth Login Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an unmistakable, accessible success or failure result after OAuth, with bottom-footer Done and retry controls.

**Architecture:** Keep the existing main-process and IPC event contract unchanged. Add a pure renderer helper that derives the current terminal result from OAuth events and start errors, then let `OAuthLoginDialog` render terminal cards and own retry/reset behavior.

**Tech Stack:** React 18, TypeScript, TanStack Query mutations, Tailwind-style project utility classes, Vitest.

---

## File structure

- Modify `src/renderer/components/OAuthLoginDialog.tsx`: derive terminal state, reset/retry login, render status cards, details disclosure, and terminal footer actions.
- Create `src/renderer/utils/oauth-login-result.ts`: pure terminal-result derivation for the current login.
- Create `tests/unit/oauth-login-result.test.ts`: focused state derivation regression tests.

### Task 1: Derive the current OAuth terminal result

**Files:**
- Create: `src/renderer/utils/oauth-login-result.ts`
- Create: `tests/unit/oauth-login-result.test.ts`

- [ ] **Step 1: Write failing result-derivation tests**

Create tests covering no result during progress, success for the current login, error message preservation, rejection of stale login events, and a start-mutation error:

```ts
import { describe, expect, it } from "vitest";
import type { OAuthEvent } from "../../src/shared/model-auth-types";
import { getOAuthLoginResult } from "../../src/renderer/utils/oauth-login-result";

const success: OAuthEvent = { type: "oauth.success", loginId: "current", provider: "openai-codex" };

it("returns success only for the current login", () => {
  expect(getOAuthLoginResult([success], "current", null)).toEqual({ kind: "success" });
  expect(getOAuthLoginResult([success], "other", null)).toBeNull();
});
```

Add analogous cases for `oauth.progress`, `oauth.error`, and `new Error("start failed")`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest --run tests/unit/oauth-login-result.test.ts`

Expected: FAIL because `oauth-login-result` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create:

```ts
import type { OAuthEvent } from "../../shared/model-auth-types";

export type OAuthLoginResult =
  | { kind: "success" }
  | { kind: "error"; message: string };

export function getOAuthLoginResult(
  events: OAuthEvent[],
  loginId: string | null,
  startError: Error | null,
): OAuthLoginResult | null {
  if (startError) return { kind: "error", message: startError.message };
  if (!loginId) return null;
  const terminal = [...events].reverse().find(
    (event) => event.loginId === loginId &&
      (event.type === "oauth.success" || event.type === "oauth.error"),
  );
  if (!terminal) return null;
  return terminal.type === "oauth.success"
    ? { kind: "success" }
    : { kind: "error", message: terminal.message };
}
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npx vitest --run tests/unit/oauth-login-result.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit the helper and tests**

```bash
git add src/renderer/utils/oauth-login-result.ts tests/unit/oauth-login-result.test.ts
git commit -m "test: define OAuth login result states"
```

### Task 2: Render accessible results and support retry

**Files:**
- Modify: `src/renderer/components/OAuthLoginDialog.tsx`
- Test: `tests/unit/oauth-login-result.test.ts`

- [ ] **Step 1: Add failing tests for event precedence**

Add tests proving a current-login terminal event takes precedence over `startError`, and that cancellation does not produce an error card. This protects retry from briefly displaying a stale mutation error:

```ts
expect(getOAuthLoginResult([success], "current", new Error("stale"))).toEqual({ kind: "success" });
expect(getOAuthLoginResult([
  { type: "oauth.cancelled", loginId: "current", provider: "openai-codex" },
], "current", null)).toBeNull();
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest --run tests/unit/oauth-login-result.test.ts`

Expected: the terminal-event precedence test FAILS under the initial helper ordering.

- [ ] **Step 3: Correct result precedence minimally**

Search for a matching terminal event first; only use `startError` when there is no terminal event. Keep cancellation non-terminal for presentation purposes.

- [ ] **Step 4: Add a reusable login reset/start callback**

Inside `OAuthLoginDialog`, add `detailsOpen` state and a `beginLogin` callback that clears `loginId`, events, prompt input, and details visibility, calls `start.reset()`, then invokes `start.mutateAsync({ provider })`. Use this callback for both initial launch and **Try again**, while preserving the effect cancellation guard.

- [ ] **Step 5: Derive and render the result card**

Use `getOAuthLoginResult(events, loginId, start.error)` and, when non-null, hide URL/prompt controls and render:

```tsx
<div
  role="status"
  aria-live="polite"
  className={`flex items-start gap-3 rounded border p-4 ${
    result.kind === "success"
      ? "border-ok surface-ok-soft text-ok"
      : "border-err surface-err-soft text-err"
  }`}
>
  <span aria-hidden="true" className="text-3xl leading-none">
    {result.kind === "success" ? "✓" : "✕"}
  </span>
  <div>
    <div className="font-semibold">
      {result.kind === "success" ? "Login successful" : "Login failed"}
    </div>
    <div className="mt-1 text-sm">
      {result.kind === "success" ? "Your OAuth token was saved." : result.message}
    </div>
  </div>
</div>
```

- [ ] **Step 6: Collapse diagnostic history after completion**

Keep the active-login event history unchanged. For a terminal result, replace it with a button labeled **Authentication details** using `aria-expanded`; reveal the existing event list only when expanded.

- [ ] **Step 7: Put terminal actions in the bottom footer**

For success, render only primary **Done**, calling `onClose`. For failure, render **Close** and primary **Try again**; disable **Try again** while `start.isPending`. Preserve existing Cancel behavior for active login.

- [ ] **Step 8: Run focused and full verification**

Run:

```bash
npx vitest --run tests/unit/oauth-login-result.test.ts
npm run typecheck
npm run lint
npm test
```

Expected: all commands exit 0 with no failures or warnings.

- [ ] **Step 9: Verify affected scope**

Run GitNexus `detect_changes({ scope: "compare", base_ref: "main" })` and confirm only OAuth dialog result presentation and its pure helper/test are affected. If the MCP server remains unavailable, report that explicitly and inspect `git diff --stat`, `git diff --check`, and the complete diff instead.

- [ ] **Step 10: Commit the UI behavior**

```bash
git add src/renderer/components/OAuthLoginDialog.tsx src/renderer/utils/oauth-login-result.ts tests/unit/oauth-login-result.test.ts
git commit -m "feat: clarify OAuth login results"
```
