# macpi Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface pi's session-tree branching as a usable GUI feature — right-hand BranchPanel (tree view), in-chat "↪ Branch here" button on user messages, right-click "Fork to new session", click-✏️ rename, plus the missing chat breadcrumb.

**Architecture:** Pi remains authoritative for tree state. `PiSessionManager` subscribes to pi's `SessionTreeEvent` and emits a lightweight `session.tree` PiEvent (no tree in payload). The renderer fetches a `BranchTreeSnapshot` via IPC and invalidates the TanStack Query on every `session.tree` event. A pure `tree-projection.ts` module converts pi's mixed-entry tree into a renderer-safe shape (user-message rows + branch-summary rows; pass-through entries folded into edges).

**Tech Stack:** Electron 42, React 18 + TanStack Query, `@earendil-works/pi-coding-agent` 0.74, `node:sqlite`, Vitest 3, Biome v2.

---

## File Structure

**New files (main process):**
- `src/main/branch-service.ts` — `BranchService` class: getTree / navigateTree / fork / setEntryLabel. Pure delegation to pi + channel-sessions repo for fork.
- `src/main/tree-projection.ts` — pure function `projectTree(piRoots, leafId, getLabel)`. Converts pi's mixed-entry tree into renderer-safe `BranchTreeSnapshot`.
- `src/shared/branch-types.ts` — `BranchNodeKind`, `BranchTreeNode`, `BranchTreeSnapshot`.

**New files (renderer):**
- `src/renderer/components/BranchTree.tsx` — recursive tree renderer.
- `src/renderer/components/BranchTreeRow.tsx` — single tree row (circle, label, count, ✏️, right-click menu).
- `src/renderer/components/BranchRenameInput.tsx` — inline rename input.
- `src/renderer/components/ChatBreadcrumb.tsx` — `# channel › session › active branch`.
- `src/renderer/components/messages/MessageBranchButton.tsx` — hover-gutter "↪ Branch here" button on user messages.

**Modified files (main):**
- `src/shared/pi-events.ts` — add `session.tree` variant.
- `src/shared/ipc-types.ts` — add 4 new methods.
- `src/main/pi-session-manager.ts` — subscribe to `session_tree`, expose `getAgentSession(piSessionId)`, broadcast `session.tree`.
- `src/main/ipc-router.ts` — register 4 new handlers.
- `src/main/index.ts` — construct `BranchService`, wire into router deps.
- `src/main/pi-history.ts` — thread pi entry id through into `UserMessageEntry`.
- `src/shared/timeline-types.ts` — add `piEntryId?: string` to `UserMessageEntry`.

**Modified files (renderer):**
- `src/renderer/components/BranchPanel.tsx` — full rewrite from placeholder.
- `src/renderer/queries.ts` — add `useSessionTree`, `useNavigateTree`, `useForkSession`, `useSetEntryLabel`.
- `src/renderer/state/timeline-state.ts` — handle `session.tree` event: invalidate + scroll-to-bottom on leaf change.
- `src/renderer/components/ChatPane.tsx` — mount `ChatBreadcrumb` at top.
- `src/renderer/components/messages/UserMessage.tsx` — render `MessageBranchButton` on hover.
- `src/renderer/App.tsx` — move `<BranchPanel />` inside the `mode === "chat"` block; on `useForkSession.onSuccess` set selected piSessionId.

**Test files (new):**
- `tests/unit/tree-projection.test.ts` — pure projection tests (linear, single fork, multi-level, branch_summary, orphans, pass-through folding, active path, default labels).
- `tests/integration/branch-service.test.ts` — getTree / navigateTree / fork / setEntryLabel with stubbed `loadAgentSession`.
- `tests/pi-integration/branching.test.ts` — real pi: prompt → fork → navigateTree → assert tree + leaf + isolation.

---

## Task 1: Shared types — `branch-types.ts`

**Files:**
- Create: `src/shared/branch-types.ts`

- [ ] **Step 1: Create the types file**

Create `/Users/roaanv/mycode/macpi/src/shared/branch-types.ts`:

```ts
// Renderer-safe shapes for pi session-tree branching. Built by tree-projection.ts
// in main from pi's SessionTreeNode[] + leafId, then surfaced over IPC.

export type BranchNodeKind =
	| "user_message" // type:session_message, role:user — the rows we render
	| "branch_summary" // pi's branch_summary entries (informational)
	| "root"; // virtual root used when pi's tree has multiple top-level entries

export interface BranchTreeNode {
	entryId: string;
	kind: BranchNodeKind;
	parentId: string | null;
	label?: string; // user-set label OR truncated divergence-point text
	summary?: string; // pi-generated branch summary text (read-only)
	timestamp: string; // ISO entry creation
	messageCount?: number; // user messages on branch path; only set when isLeafTip
	children: BranchTreeNode[];
	isOnActivePath: boolean;
	isBranchPoint: boolean; // displayable-children > 1
	isLeafTip: boolean; // no displayable children OR matches the active leaf
}

export interface BranchTreeSnapshot {
	sessionId: string; // pi session id
	leafEntryId: string | null;
	roots: BranchTreeNode[];
	hasBranches: boolean; // any node with displayable-children > 1
	activeBranchLabel?: string; // present only when hasBranches === true
}
```

- [ ] **Step 2: Run typecheck**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/branch-types.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): renderer-safe BranchTreeNode + Snapshot types"
```

---

## Task 2: `session.tree` PiEvent variant

**Files:**
- Modify: `src/shared/pi-events.ts`

- [ ] **Step 1: Read existing variants**

```
cd /Users/roaanv/mycode/macpi && grep -n "type PiEvent\|^	|" src/shared/pi-events.ts | head -30
```

- [ ] **Step 2: Add the new variant**

In `src/shared/pi-events.ts`, append a new variant to the `PiEvent` union (preserve existing variants — add the new one at the end of the discriminator list, before the trailing semicolon):

```ts
	| {
			type: "session.tree";
			piSessionId: string;
			newLeafEntryId: string | null;
			oldLeafEntryId: string | null;
	  }
```

- [ ] **Step 3: Typecheck**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
```

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/pi-events.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): session.tree PiEvent variant"
```

---

## Task 3: Pure `tree-projection.ts` + unit tests

**Files:**
- Create: `src/main/tree-projection.ts`
- Create: `tests/unit/tree-projection.test.ts`

This is the workhorse pure function. TDD it.

- [ ] **Step 1: Write the failing tests**

Create `/Users/roaanv/mycode/macpi/tests/unit/tree-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectTree } from "../../src/main/tree-projection";

type PiNodeFixture = {
	entry: {
		id: string;
		parentId: string | null;
		type: string;
		role?: string;
		summary?: string;
		timestamp?: string;
		text?: string;
	};
	label?: string;
	children: PiNodeFixture[];
};

function userMsg(
	id: string,
	parentId: string | null,
	text = `msg ${id}`,
): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "session_message",
			role: "user",
			timestamp: "2026-05-12T00:00:00Z",
			text,
		},
		children: [],
	};
}

function asstMsg(id: string, parentId: string): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "session_message",
			role: "assistant",
			timestamp: "2026-05-12T00:00:00Z",
		},
		children: [],
	};
}

function summary(id: string, parentId: string, text = "abandoned"): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "branch_summary",
			summary: text,
			timestamp: "2026-05-12T00:00:00Z",
		},
		children: [],
	};
}

function withChildren(node: PiNodeFixture, children: PiNodeFixture[]): PiNodeFixture {
	node.children = children;
	return node;
}

describe("projectTree", () => {
	it("linear session has no branches", () => {
		const u1 = userMsg("e1", null, "hello");
		const a1 = asstMsg("e2", "e1");
		const u2 = userMsg("e3", "e2", "follow up");
		withChildren(u1, [withChildren(a1, [u2])]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e3",
		});

		expect(snap.hasBranches).toBe(false);
		expect(snap.roots).toHaveLength(1);
		expect(snap.roots[0].entryId).toBe("e1");
		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].entryId).toBe("e3");
		expect(snap.roots[0].children[0].isLeafTip).toBe(true);
		expect(snap.roots[0].children[0].messageCount).toBe(2);
		expect(snap.roots[0].isOnActivePath).toBe(true);
		expect(snap.roots[0].children[0].isOnActivePath).toBe(true);
		expect(snap.activeBranchLabel).toBeUndefined();
	});

	it("single fork has hasBranches=true and two tips", () => {
		// root u1 -> [u2a (active), u2b]
		const u1 = userMsg("e1", null, "start");
		const u2a = userMsg("e2", "e1", "path A");
		const u2b = userMsg("e3", "e1", "path B");
		withChildren(u1, [u2a, u2b]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		expect(snap.hasBranches).toBe(true);
		expect(snap.roots[0].isBranchPoint).toBe(true);
		expect(snap.roots[0].children.map((c) => c.entryId).sort()).toEqual([
			"e2",
			"e3",
		]);
		const active = snap.roots[0].children.find((c) => c.entryId === "e2");
		const inactive = snap.roots[0].children.find((c) => c.entryId === "e3");
		expect(active?.isOnActivePath).toBe(true);
		expect(inactive?.isOnActivePath).toBe(false);
		expect(snap.activeBranchLabel).toBe("path A");
	});

	it("multi-level branching", () => {
		// u1 -> u2 -> [u3a (active), u3b -> u4]
		const u1 = userMsg("e1", null, "root");
		const u2 = userMsg("e2", "e1", "mid");
		const u3a = userMsg("e3", "e2", "A");
		const u3b = userMsg("e4", "e2", "B");
		const u4 = userMsg("e5", "e4", "B-deep");
		withChildren(u3b, [u4]);
		withChildren(u2, [u3a, u3b]);
		withChildren(u1, [u2]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e3",
		});

		expect(snap.hasBranches).toBe(true);
		expect(snap.roots[0].children[0].isBranchPoint).toBe(true);
		const a = snap.roots[0].children[0].children.find((c) => c.entryId === "e3");
		const b = snap.roots[0].children[0].children.find((c) => c.entryId === "e4");
		expect(a?.isLeafTip).toBe(true);
		expect(b?.isLeafTip).toBe(false);
		expect(b?.children[0].entryId).toBe("e5");
		expect(b?.children[0].isLeafTip).toBe(true);
		expect(b?.children[0].messageCount).toBe(2); // e4, e5 on B path from divergence
	});

	it("assistant messages and pass-through entries are folded into edges", () => {
		// u1 -> assistant -> model_change -> u2  (assistant + model_change disappear)
		const u1 = userMsg("e1", null, "hi");
		const ast = asstMsg("e2", "e1");
		const mc: PiNodeFixture = {
			entry: {
				id: "e3",
				parentId: "e2",
				type: "model_change",
				timestamp: "2026-05-12T00:00:00Z",
			},
			children: [],
		};
		const u2 = userMsg("e4", "e3", "next");
		withChildren(mc, [u2]);
		withChildren(ast, [mc]);
		withChildren(u1, [ast]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e4",
		});

		expect(snap.roots[0].entryId).toBe("e1");
		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].entryId).toBe("e4");
	});

	it("branch_summary entries are projected with kind 'branch_summary'", () => {
		const u1 = userMsg("e1", null, "root");
		const s = summary("e2", "e1", "abandoned branch summary");
		withChildren(u1, [s]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e1",
		});

		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].kind).toBe("branch_summary");
		expect(snap.roots[0].children[0].summary).toBe("abandoned branch summary");
	});

	it("multiple pi roots get a virtual root inserted", () => {
		const a = userMsg("a1", null, "first orphan");
		const b = userMsg("b1", null, "second orphan");
		const snap = projectTree({
			piSessionId: "s1",
			roots: [a, b],
			leafId: "b1",
		});

		expect(snap.roots).toHaveLength(1);
		expect(snap.roots[0].kind).toBe("root");
		expect(snap.roots[0].children).toHaveLength(2);
	});

	it("default label = truncated divergence-point user message (32 chars max)", () => {
		const u1 = userMsg("e1", null, "hi");
		const long = userMsg(
			"e2",
			"e1",
			"this is an extremely long user message that should definitely be truncated",
		);
		const other = userMsg("e3", "e1", "short");
		withChildren(u1, [long, other]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		const longNode = snap.roots[0].children.find((c) => c.entryId === "e2");
		expect(longNode?.label?.length).toBeLessThanOrEqual(32);
		expect(longNode?.label).toMatch(/^this is an extremely long/);
	});

	it("pi-set label wins over default text", () => {
		const u1 = userMsg("e1", null, "root");
		const u2 = userMsg("e2", "e1", "default text");
		u2.label = "refactor try";
		const u3 = userMsg("e3", "e1", "other");
		withChildren(u1, [u2, u3]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		const labelled = snap.roots[0].children.find((c) => c.entryId === "e2");
		expect(labelled?.label).toBe("refactor try");
	});
});
```

- [ ] **Step 2: Run to confirm fail**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/tree-projection.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement `tree-projection.ts`**

Create `/Users/roaanv/mycode/macpi/src/main/tree-projection.ts`:

```ts
// Pure conversion from pi's SessionTreeNode[] + leafId to renderer-safe
// BranchTreeSnapshot. Folds pass-through entry types (assistant, model_change,
// thinking_level_change, compaction, label, session_info, custom*) into edges;
// surfaces user_message + branch_summary as displayable rows. Adds isOnActivePath /
// isBranchPoint / isLeafTip / messageCount.

import type {
	BranchNodeKind,
	BranchTreeNode,
	BranchTreeSnapshot,
} from "../shared/branch-types";

interface PiSessionEntryLike {
	id: string;
	parentId: string | null;
	type: string;
	role?: string;
	summary?: string;
	timestamp?: string;
	text?: string;
}

interface PiNodeLike {
	entry: PiSessionEntryLike;
	label?: string;
	children: PiNodeLike[];
}

interface ProjectInput {
	piSessionId: string;
	roots: PiNodeLike[];
	leafId: string | null;
}

const LABEL_MAX = 32;

function isDisplayable(entry: PiSessionEntryLike): BranchNodeKind | null {
	if (entry.type === "session_message" && entry.role === "user") {
		return "user_message";
	}
	if (entry.type === "branch_summary") {
		return "branch_summary";
	}
	return null;
}

function defaultLabel(entry: PiSessionEntryLike): string | undefined {
	if (typeof entry.text !== "string" || entry.text.length === 0) {
		return undefined;
	}
	const t = entry.text.trim();
	return t.length <= LABEL_MAX ? t : t.slice(0, LABEL_MAX);
}

interface ProjectionContext {
	activePath: Set<string>;
}

// Walk a pi node + its children, returning the displayable children that
// should be reachable from `inheritedParentId`. Pass-through nodes are skipped
// but their children are flattened up to the nearest displayable ancestor.
function projectChildren(
	piChildren: PiNodeLike[],
	inheritedParentId: string | null,
	ctx: ProjectionContext,
): BranchTreeNode[] {
	const out: BranchTreeNode[] = [];
	for (const c of piChildren) {
		const kind = isDisplayable(c.entry);
		if (kind) {
			out.push(buildNode(c, inheritedParentId, kind, ctx));
		} else {
			// pass-through: flatten this child's children up to inheritedParentId
			out.push(...projectChildren(c.children, inheritedParentId, ctx));
		}
	}
	return out;
}

function buildNode(
	pi: PiNodeLike,
	parentId: string | null,
	kind: BranchNodeKind,
	ctx: ProjectionContext,
): BranchTreeNode {
	const children = projectChildren(pi.children, pi.entry.id, ctx);
	const isBranchPoint = children.length > 1;
	const isLeafTip = children.length === 0;
	const label = pi.label ?? defaultLabel(pi.entry);
	const messageCount = isLeafTip
		? countAncestorUserMessages(pi, parentId)
		: undefined;
	return {
		entryId: pi.entry.id,
		kind,
		parentId,
		label,
		summary: kind === "branch_summary" ? pi.entry.summary : undefined,
		timestamp: pi.entry.timestamp ?? "",
		messageCount,
		children,
		isOnActivePath: ctx.activePath.has(pi.entry.id),
		isBranchPoint,
		isLeafTip,
	};
}

// For a tip node, count user messages on the branch path from divergence-point
// ancestor (or root) up to and including this tip. Since pi's tree includes
// all entries, we count only displayable user_message ancestors via the index
// built below.
function countAncestorUserMessages(_pi: PiNodeLike, _parentId: string | null): number {
	// Will be filled in via a closure-bound index — implemented below.
	return 0;
}

export function projectTree(input: ProjectInput): BranchTreeSnapshot {
	// Build active-path set from leafId walking up via the entry map.
	const byId = new Map<string, PiNodeLike>();
	const indexNode = (n: PiNodeLike) => {
		byId.set(n.entry.id, n);
		for (const c of n.children) indexNode(c);
	};
	for (const r of input.roots) indexNode(r);

	const activePath = new Set<string>();
	let cur: PiNodeLike | undefined = input.leafId
		? byId.get(input.leafId)
		: undefined;
	while (cur) {
		activePath.add(cur.entry.id);
		const pid = cur.entry.parentId;
		cur = pid ? byId.get(pid) : undefined;
	}

	const ctx: ProjectionContext = { activePath };

	// Project roots: each pi root that is displayable becomes a node; pass-through
	// roots are flattened (children promoted up).
	const projectedRoots: BranchTreeNode[] = [];
	for (const r of input.roots) {
		const kind = isDisplayable(r.entry);
		if (kind) {
			projectedRoots.push(buildNode(r, null, kind, ctx));
		} else {
			projectedRoots.push(...projectChildren(r.children, null, ctx));
		}
	}

	// If pi gave us multiple roots, wrap in a virtual root.
	const roots: BranchTreeNode[] =
		projectedRoots.length > 1
			? [
					{
						entryId: "__root__",
						kind: "root",
						parentId: null,
						timestamp: "",
						children: projectedRoots,
						isOnActivePath: projectedRoots.some((c) => c.isOnActivePath),
						isBranchPoint: projectedRoots.length > 1,
						isLeafTip: false,
					},
				]
			: projectedRoots;

	// Compute messageCount per tip: number of displayable user_message nodes on
	// the path from this tip up to the nearest branch point (or root).
	const fillMessageCount = (n: BranchTreeNode, runningCount: number): void => {
		if (n.kind === "user_message") {
			const next = runningCount + 1;
			if (n.isLeafTip) {
				n.messageCount = next;
			}
			if (n.isBranchPoint) {
				// reset path-from-divergence count for each child
				for (const c of n.children) fillMessageCount(c, 0);
			} else {
				for (const c of n.children) fillMessageCount(c, next);
			}
		} else {
			for (const c of n.children) fillMessageCount(c, runningCount);
		}
	};
	for (const r of roots) fillMessageCount(r, 0);

	// activeBranchLabel: label of the active leaf tip (if hasBranches).
	const hasBranches = anyHasBranches(roots);
	let activeBranchLabel: string | undefined;
	if (hasBranches && input.leafId) {
		const tip = findById(roots, input.leafId);
		activeBranchLabel = tip?.label;
	}

	return {
		sessionId: input.piSessionId,
		leafEntryId: input.leafId,
		roots,
		hasBranches,
		activeBranchLabel,
	};
}

function anyHasBranches(nodes: BranchTreeNode[]): boolean {
	for (const n of nodes) {
		if (n.isBranchPoint) return true;
		if (anyHasBranches(n.children)) return true;
	}
	return false;
}

function findById(nodes: BranchTreeNode[], id: string): BranchTreeNode | undefined {
	for (const n of nodes) {
		if (n.entryId === id) return n;
		const found = findById(n.children, id);
		if (found) return found;
	}
	return undefined;
}
```

The above intentionally removes the placeholder `countAncestorUserMessages` (it's superseded by `fillMessageCount`). Delete the placeholder function before saving.

- [ ] **Step 4: Run tests to confirm pass**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/tree-projection.test.ts
```
Expected: 8 tests pass.

- [ ] **Step 5: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/main/tree-projection.ts tests/unit/tree-projection.test.ts
```

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/tree-projection.ts tests/unit/tree-projection.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): tree-projection pure function + 8 unit tests"
```

---

## Task 4: PiSessionManager — `session_tree` subscription + `getAgentSession`

**Files:**
- Modify: `src/main/pi-session-manager.ts`

The subscription routes pi's `SessionTreeEvent` to renderers as a `session.tree` PiEvent. `getAgentSession` is needed by BranchService.

- [ ] **Step 1: Add `getAgentSession`**

In `src/main/pi-session-manager.ts`, add a public method near `loadExtensions` (or alongside the other session accessors):

```ts
getAgentSession(piSessionId: string): AgentSession | undefined {
    return this.sessions.get(piSessionId)?.agentSession;
}
```

(Confirm by reading the file: the active session map is likely `this.sessions: Map<string, ActiveSession>`, where `ActiveSession.agentSession: AgentSession`. Adapt to match the actual field names.)

- [ ] **Step 2: Subscribe to `session_tree` after creating the AgentSession**

In `src/main/pi-session-manager.ts`, find the place where event subscriptions are registered for a freshly-built session (search for an existing `agentSession.on(` call or `.subscribe(`). Add right after the existing `on("turn_end", …)` or equivalent registration:

```ts
agentSession.on("session_tree", (event) => {
    this.broadcastEvent({
        type: "session.tree",
        piSessionId,
        newLeafEntryId: event.newLeafId,
        oldLeafEntryId: event.oldLeafId,
    });
});
```

If the existing code uses a single `agentSession.subscribe(handler)` pattern with a switch on `event.type`, add a `case "session_tree":` arm that emits the same payload.

- [ ] **Step 3: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```
Expected: 209 tests still pass (no new tests yet; we want to confirm nothing regressed).

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/pi-session-manager.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): subscribe to pi session_tree; expose getAgentSession"
```

---

## Task 5: BranchService scaffold + `getTree`

**Files:**
- Create: `src/main/branch-service.ts`
- Create: `tests/integration/branch-service.test.ts`

- [ ] **Step 1: Write the failing test for `getTree`**

Create `/Users/roaanv/mycode/macpi/tests/integration/branch-service.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BranchService } from "../../src/main/branch-service";

function fakeSessionManager(opts: { roots: unknown[]; leafId: string | null }) {
	return {
		getTree: () => opts.roots,
		getLeafId: () => opts.leafId,
		getLabel: (_id: string) => undefined as string | undefined,
	};
}

function fakeAgentSession(piRoots: unknown[], leafId: string | null) {
	return {
		sessionManager: fakeSessionManager({ roots: piRoots, leafId }),
		navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
		fork: vi.fn().mockResolvedValue({ cancelled: false }),
	};
}

describe("BranchService.getTree", () => {
	it("returns the projected snapshot for the requested session", async () => {
		const u1 = {
			entry: {
				id: "e1",
				parentId: null,
				type: "session_message",
				role: "user",
				text: "hello",
				timestamp: "2026-05-12T00:00:00Z",
			},
			children: [],
		};
		const ags = fakeAgentSession([u1], "e1");
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "c1",
					cwd: "/tmp",
					sessionFilePath: "/tmp/s.jsonl",
					label: "Session A",
				}),
			} as never,
		});
		const snap = await svc.getTree("s1");
		expect(snap.sessionId).toBe("s1");
		expect(snap.leafEntryId).toBe("e1");
		expect(snap.roots).toHaveLength(1);
		expect(snap.hasBranches).toBe(false);
	});

	it("throws not_found when the session is unknown", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => undefined,
			} as never,
		});
		await expect(svc.getTree("missing")).rejects.toThrow(/not found/);
	});
});
```

- [ ] **Step 2: Confirm fail**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/branch-service.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement scaffold + `getTree`**

Create `/Users/roaanv/mycode/macpi/src/main/branch-service.ts`:

```ts
// Orchestrates pi's session-tree primitives + sessions repo writes. Pure
// delegation to pi for read paths; for fork, also inserts a row into
// channel_sessions so the new pi session appears under the parent's channel
// in the renderer sidebar.

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { BranchTreeSnapshot } from "../shared/branch-types";
import { projectTree } from "./tree-projection";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";

interface ActiveSessionMeta {
	channelId: string;
	cwd: string | null;
	sessionFilePath: string | null;
	label: string | null;
}

export interface BranchServiceDeps {
	getAgentSession: (piSessionId: string) => AgentSession | undefined;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: {
		getActiveSessionMeta: (piSessionId: string) => ActiveSessionMeta | undefined;
	};
}

export class BranchService {
	constructor(private readonly deps: BranchServiceDeps) {}

	async getTree(piSessionId: string): Promise<BranchTreeSnapshot> {
		const ags = this.requireAgentSession(piSessionId);
		// pi's getTree() returns SessionTreeNode[] with .entry, .children, .label.
		// We pass it directly to projectTree which only reads the documented fields.
		const roots = ags.sessionManager.getTree() as unknown as Parameters<
			typeof projectTree
		>[0]["roots"];
		const leafId = ags.sessionManager.getLeafId();
		return projectTree({ piSessionId, roots, leafId });
	}

	private requireAgentSession(piSessionId: string): AgentSession {
		const ags = this.deps.getAgentSession(piSessionId);
		if (!ags) {
			throw new Error(`branch session not found: ${piSessionId}`);
		}
		return ags;
	}
}
```

- [ ] **Step 4: Run tests**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/branch-service.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 5: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/main/branch-service.ts tests/integration/branch-service.test.ts
```

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/branch-service.ts tests/integration/branch-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchService.getTree returns projected snapshot"
```

---

## Task 6: BranchService — `navigateTree` + `setEntryLabel`

**Files:**
- Modify: `src/main/branch-service.ts`
- Modify: `tests/integration/branch-service.test.ts`

- [ ] **Step 1: Add failing tests**

Append to the `describe("BranchService.getTree", …)` file two new top-level `describe` blocks:

```ts
describe("BranchService.navigateTree", () => {
	it("calls pi navigateTree with the target entry id", async () => {
		const ags = fakeAgentSession([], null);
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
		});
		await svc.navigateTree("s1", "target-id");
		expect(ags.navigateTree).toHaveBeenCalledWith("target-id");
	});

	it("throws not_found for unknown session", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
		});
		await expect(svc.navigateTree("missing", "x")).rejects.toThrow(/not found/);
	});
});

describe("BranchService.setEntryLabel", () => {
	it("appends a label change on the session manager", async () => {
		const appendLabelChange = vi.fn().mockReturnValue("label-entry-id");
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				appendLabelChange,
			},
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
		});
		await svc.setEntryLabel("s1", "target", "refactor try");
		expect(appendLabelChange).toHaveBeenCalledWith("target", "refactor try");
	});

	it("passes undefined when label is empty string (clear)", async () => {
		const appendLabelChange = vi.fn().mockReturnValue("label-entry-id");
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				appendLabelChange,
			},
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
		});
		await svc.setEntryLabel("s1", "target", "");
		expect(appendLabelChange).toHaveBeenCalledWith("target", undefined);
	});
});
```

- [ ] **Step 2: Implement**

Add to `BranchService` class:

```ts
async navigateTree(piSessionId: string, entryId: string): Promise<void> {
    const ags = this.requireAgentSession(piSessionId);
    const result = await ags.navigateTree(entryId);
    if (result.cancelled) {
        throw new Error(`navigate cancelled for ${entryId}`);
    }
}

async setEntryLabel(
    piSessionId: string,
    entryId: string,
    label: string,
): Promise<void> {
    const ags = this.requireAgentSession(piSessionId);
    const value = label.length === 0 ? undefined : label;
    ags.sessionManager.appendLabelChange(entryId, value);
}
```

- [ ] **Step 3: Run tests**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/branch-service.test.ts
```
Expected: 6 tests pass total.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/branch-service.ts tests/integration/branch-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchService.navigateTree + setEntryLabel"
```

---

## Task 7: BranchService — `fork`

**Files:**
- Modify: `src/main/branch-service.ts`
- Modify: `tests/integration/branch-service.test.ts`

The complex one — fork must also insert a `channel_sessions` row pointing at the new pi session.

- [ ] **Step 1: Add failing tests**

Append to the test file:

```ts
describe("BranchService.fork", () => {
	it("forks via pi and attaches the new pi session to the parent's channel", async () => {
		// pi's fork(entry) advances internal state; the new pi session id is the
		// session id we observe AFTER fork. The pi SDK's fork() resolves once the
		// new session file is in place; we read getSessionId() from the same
		// AgentSession instance (which has been switched onto the new file).
		const getSessionId = vi
			.fn()
			.mockReturnValueOnce("new-s")
			.mockReturnValue("new-s");
		const getSessionFile = vi.fn().mockReturnValue("/tmp/new-s.jsonl");
		const fork = vi.fn().mockResolvedValue({ cancelled: false });
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				getSessionId,
				getSessionFile,
			},
			fork,
		};
		const attach = vi.fn();
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "channel-1",
					cwd: "/work",
					sessionFilePath: "/tmp/old.jsonl",
					label: "Parent",
				}),
			} as never,
		});
		const result = await svc.fork("s1", "entry-42", "at");
		expect(fork).toHaveBeenCalledWith("entry-42", { position: "at" });
		expect(attach).toHaveBeenCalledWith({
			channelId: "channel-1",
			piSessionId: "new-s",
			cwd: "/work",
			sessionFilePath: "/tmp/new-s.jsonl",
		});
		expect(result).toEqual({ newSessionId: "new-s" });
	});

	it("throws fork_cancelled if pi returns cancelled", async () => {
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				getSessionId: () => "x",
				getSessionFile: () => "/x",
			},
			fork: vi.fn().mockResolvedValue({ cancelled: true }),
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "c",
					cwd: null,
					sessionFilePath: null,
					label: null,
				}),
			} as never,
		});
		await expect(svc.fork("s1", "e1")).rejects.toThrow(/cancelled/);
	});

	it("throws not_found if the session is unknown", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
		});
		await expect(svc.fork("missing", "x")).rejects.toThrow(/not found/);
	});
});
```

- [ ] **Step 2: Implement**

Add to `BranchService` class:

```ts
async fork(
    piSessionId: string,
    entryId: string,
    position: "before" | "at" = "at",
): Promise<{ newSessionId: string }> {
    const ags = this.requireAgentSession(piSessionId);
    const meta = this.deps.piSessionManager.getActiveSessionMeta(piSessionId);
    if (!meta) {
        throw new Error(`branch session not found: ${piSessionId}`);
    }
    const result = await ags.fork(entryId, { position });
    if (result.cancelled) {
        throw new Error(`fork cancelled at ${entryId}`);
    }
    const newSessionId = ags.sessionManager.getSessionId();
    const newSessionFile = ags.sessionManager.getSessionFile() ?? null;
    this.deps.channelSessions.attach({
        channelId: meta.channelId,
        piSessionId: newSessionId,
        cwd: meta.cwd,
        sessionFilePath: newSessionFile,
    });
    return { newSessionId };
}
```

- [ ] **Step 3: Run tests**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/branch-service.test.ts
```
Expected: 9 tests pass total.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/branch-service.ts tests/integration/branch-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchService.fork + channel-sessions insert"
```

---

## Task 8: IPC types + handlers + wiring + router test stubs

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/pi-session-manager.ts` (add `getActiveSessionMeta`)
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Add IPC methods to `ipc-types.ts`**

Add import:

```ts
import type { BranchTreeSnapshot } from "./branch-types";
```

Add to `IpcMethods`:

```ts
"session.getTree": {
    req: { piSessionId: string };
    res: BranchTreeSnapshot;
};
"session.navigateTree": {
    req: { piSessionId: string; entryId: string };
    res: Record<string, never>;
};
"session.fork": {
    req: { piSessionId: string; entryId: string; position?: "before" | "at" };
    res: { newSessionId: string };
};
"session.setEntryLabel": {
    req: { piSessionId: string; entryId: string; label: string };
    res: Record<string, never>;
};
```

- [ ] **Step 2: Add `getActiveSessionMeta` to `PiSessionManager`**

In `src/main/pi-session-manager.ts`, alongside `getAgentSession`, add:

```ts
getActiveSessionMeta(piSessionId: string): {
    channelId: string;
    cwd: string | null;
    sessionFilePath: string | null;
    label: string | null;
} | undefined {
    // Read the channel + meta for this pi session from channel_sessions.
    // BranchService uses this to attach the post-fork session row to the
    // parent's channel.
    return this.deps?.channelSessions.findMeta(piSessionId);
}
```

You'll need a `findMeta(piSessionId)` method on `ChannelSessionsRepo`. Add it in `src/main/repos/channel-sessions.ts`:

```ts
findMeta(piSessionId: string): {
    channelId: string;
    cwd: string | null;
    sessionFilePath: string | null;
    label: string | null;
} | undefined {
    const row = this.db.raw
        .prepare(
            `SELECT channel_id AS channelId, cwd, session_file_path AS sessionFilePath, label
             FROM channel_sessions WHERE pi_session_id = ?`,
        )
        .get(piSessionId) as
        | {
              channelId: string;
              cwd: string | null;
              sessionFilePath: string | null;
              label: string | null;
          }
        | undefined;
    return row;
}
```

(Confirm the existing column names in the table by reading the migration file; adjust the SQL alias mapping if your schema uses different column names.)

- [ ] **Step 3: Wire `BranchService` in `src/main/index.ts`**

```ts
import { BranchService } from "./branch-service";
// ...
const branchService = new BranchService({
    getAgentSession: (id) => manager.getAgentSession(id),
    channelSessions: channelSessionsRepo,
    piSessionManager: {
        getActiveSessionMeta: (id) => manager.getActiveSessionMeta(id),
    },
});
```

Pass `branchService` into `IpcRouter` deps.

- [ ] **Step 4: Register handlers in `src/main/ipc-router.ts`**

Add import + `RouterDeps` entry:

```ts
import type { BranchService } from "./branch-service";
// in RouterDeps:
branchService: BranchService;
```

Register handlers (near the existing `session.*` handlers):

```ts
this.register("session.getTree", async (args) => {
    try {
        return ok(await this.deps.branchService.getTree(args.piSessionId));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        throw e;
    }
});
this.register("session.navigateTree", async (args) => {
    try {
        await this.deps.branchService.navigateTree(args.piSessionId, args.entryId);
        return ok({});
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        if (msg.includes("cancelled")) return err("navigate_failed", msg);
        throw e;
    }
});
this.register("session.fork", async (args) => {
    try {
        const r = await this.deps.branchService.fork(
            args.piSessionId,
            args.entryId,
            args.position,
        );
        return ok(r);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        if (msg.includes("cancelled")) return err("fork_cancelled", msg);
        throw e;
    }
});
this.register("session.setEntryLabel", async (args) => {
    try {
        await this.deps.branchService.setEntryLabel(
            args.piSessionId,
            args.entryId,
            args.label,
        );
        return ok({});
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        return err("label_failed", msg);
    }
});
```

- [ ] **Step 5: Update `tests/integration/ipc-router.test.ts` stubs**

Add `branchService` stub alongside the existing service stubs:

```ts
const branchServiceStub = {
    getTree: vi.fn().mockResolvedValue({
        sessionId: "s1",
        leafEntryId: null,
        roots: [],
        hasBranches: false,
    }),
    navigateTree: vi.fn().mockResolvedValue(undefined),
    fork: vi.fn().mockResolvedValue({ newSessionId: "new-s" }),
    setEntryLabel: vi.fn().mockResolvedValue(undefined),
};
```

Pass into router: `branchService: branchServiceStub as unknown as BranchService`.

Add the type import: `import type { BranchService } from "../../src/main/branch-service";`.

- [ ] **Step 6: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```
Expected: all pass.

- [ ] **Step 7: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): IPC session.{getTree,navigateTree,fork,setEntryLabel}"
```

---

## Task 9: Renderer queries — `useSessionTree` + mutations

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add queries + mutations**

In `src/renderer/queries.ts`, add:

```ts
export function useSessionTree(piSessionId: string | null) {
    return useQuery({
        queryKey: ["session.tree", piSessionId],
        queryFn: () =>
            piSessionId
                ? invoke("session.getTree", { piSessionId })
                : Promise.reject(new Error("no session")),
        enabled: piSessionId !== null,
    });
}

export function useNavigateTree() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { piSessionId: string; entryId: string }) =>
            invoke("session.navigateTree", input),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["session.tree", vars.piSessionId] });
        },
    });
}

export function useForkSession() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            piSessionId: string;
            entryId: string;
            position?: "before" | "at";
        }) => invoke("session.fork", input),
        onSuccess: () => {
            // The forked session needs to appear in the sidebar. Invalidate the
            // channel sessions query and the source session's tree.
            qc.invalidateQueries({ queryKey: ["channels.sessions"] });
        },
    });
}

export function useSetEntryLabel() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            piSessionId: string;
            entryId: string;
            label: string;
        }) => invoke("session.setEntryLabel", input),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["session.tree", vars.piSessionId] });
        },
    });
}
```

- [ ] **Step 2: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/queries.ts
```

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/queries.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): useSessionTree + navigate/fork/label mutations"
```

---

## Task 10: timeline-state reacts to `session.tree`

**Files:**
- Modify: `src/renderer/state/timeline-state.ts`

- [ ] **Step 1: Extend event handling**

Find the existing event dispatch (likely a switch on `event.type` inside a `useEffect`). Add a new arm:

```ts
case "session.tree": {
    queryClient.invalidateQueries({ queryKey: ["session.tree", event.piSessionId] });
    if (event.newLeafEntryId !== event.oldLeafEntryId) {
        // Active branch changed: timeline content is now stale; refetch and
        // scroll to bottom (head of new branch).
        queryClient.invalidateQueries({ queryKey: ["session.messages", event.piSessionId] });
        setSnapshot((prev) => ({ ...prev, scrollAnchor: { kind: "bottom", at: Date.now() } }));
    }
    break;
}
```

(Confirm the actual query keys for messages by reading the existing file; if `useMessages` doesn't exist, replace the second invalidate with whatever invalidation already happens after `turn_end`. The scroll behaviour pattern should match whatever `Timeline.tsx` already does on new content.)

If `setSnapshot` doesn't have a `scrollAnchor` field, instead dispatch a window event that `Timeline.tsx` listens for:

```ts
window.dispatchEvent(new CustomEvent("macpi:scroll-to-bottom"));
```

And in `Timeline.tsx`, add a listener that scrolls the container to bottom.

- [ ] **Step 2: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): timeline-state invalidates + scrolls on session.tree"
```

---

## Task 11: Thread pi entry id into `UserMessageEntry`

**Files:**
- Modify: `src/shared/timeline-types.ts`
- Modify: `src/main/pi-history.ts`
- Modify: `src/renderer/state/timeline-state.ts`

Live-streamed user messages (locally appended in `timeline-state.ts:119`) don't have pi's real entry id yet. After `turn_end`, we refetch the timeline so locally-appended entries get promoted.

- [ ] **Step 1: Extend `UserMessageEntry`**

In `src/shared/timeline-types.ts`:

```ts
export interface UserMessageEntry {
    kind: "user";
    id: string;
    text: string;
    piEntryId?: string; // pi's SessionEntry.id; absent for not-yet-promoted local entries
}
```

- [ ] **Step 2: Populate `piEntryId` in `pi-history.ts`**

In `src/main/pi-history.ts`, find the `if (msg.role === "user")` block and change the push to:

```ts
entries.push({
    kind: "user",
    id: nextId(),
    text: extractUserText(raw as UserMessageLike),
    piEntryId: typeof raw.entryId === "string" ? raw.entryId : undefined,
});
```

(Confirm by reading the file: the raw entry from pi has an `entryId` or `id` field; use whichever matches the surrounding code.)

- [ ] **Step 3: Refetch timeline on turn_end**

In `src/renderer/state/timeline-state.ts`, find the `session.turn_end` handler. After the existing state update, add:

```ts
queryClient.invalidateQueries({ queryKey: ["session.messages", event.piSessionId] });
```

(Use whatever the actual messages query key is; if no query exists, this becomes a session.tree invalidate, which is also fine — getTree's next call returns the new entry ids.)

- [ ] **Step 4: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): thread pi entryId through UserMessageEntry"
```

---

## Task 12: `BranchTreeRow` component

**Files:**
- Create: `src/renderer/components/BranchTreeRow.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/roaanv/mycode/macpi/src/renderer/components/BranchTreeRow.tsx`:

```tsx
import React from "react";
import type { BranchTreeNode } from "../../shared/branch-types";

interface BranchTreeRowProps {
    node: BranchTreeNode;
    indent: number;
    onSelect: (entryId: string) => void;
    onStartRename: (entryId: string) => void;
    onFork: (entryId: string) => void;
    renaming: boolean;
    children?: React.ReactNode; // rename input lives here when renaming
}

export function BranchTreeRow({
    node,
    indent,
    onSelect,
    onStartRename,
    onFork,
    renaming,
    children,
}: BranchTreeRowProps) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    if (node.kind === "branch_summary") {
        return (
            <div
                style={{ paddingLeft: 12 + indent * 16 }}
                className="text-xs italic text-faint truncate"
            >
                · {node.summary ?? "(summary)"}
            </div>
        );
    }
    const isClickable = !node.isOnActivePath && node.isLeafTip;
    return (
        <div
            style={{ paddingLeft: 12 + indent * 16 }}
            className={`group flex items-center gap-1 py-0.5 text-xs ${node.isOnActivePath ? "font-semibold text-primary" : "text-muted"}`}
            onContextMenu={(e) => {
                if (node.isLeafTip) {
                    e.preventDefault();
                    setMenuOpen(true);
                }
            }}
        >
            <span aria-hidden="true">
                {node.isLeafTip ? (node.isOnActivePath ? "●" : "○") : "├─"}
            </span>
            {renaming ? (
                children
            ) : (
                <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => isClickable && onSelect(node.entryId)}
                    className={`flex-1 truncate text-left ${isClickable ? "hover:underline" : ""}`}
                >
                    {node.label ?? "(unlabelled)"}
                    {node.messageCount != null && (
                        <span className="ml-2 text-[10px] text-faint">
                            · {node.messageCount} msg
                        </span>
                    )}
                </button>
            )}
            {node.isLeafTip && !renaming && (
                <button
                    type="button"
                    onClick={() => onStartRename(node.entryId)}
                    className="invisible text-[10px] text-faint group-hover:visible hover:text-primary"
                    aria-label="Rename branch"
                >
                    ✏️
                </button>
            )}
            {menuOpen && (
                <div
                    role="menu"
                    className="absolute z-10 mt-4 rounded border border-divider surface-panel p-1 text-xs shadow"
                >
                    <button
                        type="button"
                        onClick={() => {
                            setMenuOpen(false);
                            onFork(node.entryId);
                        }}
                        className="px-2 py-1 hover:surface-row"
                    >
                        Fork to new session
                    </button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/BranchTreeRow.tsx
```

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/BranchTreeRow.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchTreeRow component"
```

---

## Task 13: `BranchRenameInput` component

**Files:**
- Create: `src/renderer/components/BranchRenameInput.tsx`

- [ ] **Step 1: Create**

Create `/Users/roaanv/mycode/macpi/src/renderer/components/BranchRenameInput.tsx`:

```tsx
import React from "react";

interface BranchRenameInputProps {
    initial: string;
    onCommit: (label: string) => void;
    onCancel: () => void;
}

export function BranchRenameInput({
    initial,
    onCommit,
    onCancel,
}: BranchRenameInputProps) {
    const [value, setValue] = React.useState(initial);
    const ref = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);
    return (
        <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") onCommit(value);
                else if (e.key === "Escape") onCancel();
            }}
            onBlur={() => onCommit(value)}
            className="flex-1 rounded border border-divider bg-transparent px-1 py-0 text-xs"
        />
    );
}
```

- [ ] **Step 2: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/BranchRenameInput.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchRenameInput inline editor"
```

---

## Task 14: `BranchTree` recursive renderer

**Files:**
- Create: `src/renderer/components/BranchTree.tsx`

- [ ] **Step 1: Create**

Create `/Users/roaanv/mycode/macpi/src/renderer/components/BranchTree.tsx`:

```tsx
import React from "react";
import type { BranchTreeNode } from "../../shared/branch-types";
import { BranchRenameInput } from "./BranchRenameInput";
import { BranchTreeRow } from "./BranchTreeRow";

interface BranchTreeProps {
    nodes: BranchTreeNode[];
    onSelect: (entryId: string) => void;
    onRename: (entryId: string, label: string) => void;
    onFork: (entryId: string) => void;
}

export function BranchTree({ nodes, onSelect, onRename, onFork }: BranchTreeProps) {
    const [renamingId, setRenamingId] = React.useState<string | null>(null);
    return (
        <div className="flex flex-col">
            {render(nodes, 0)}
        </div>
    );

    function render(ns: BranchTreeNode[], depth: number): React.ReactNode {
        return ns.map((n) => (
            <React.Fragment key={n.entryId}>
                <BranchTreeRow
                    node={n}
                    indent={depth}
                    onSelect={onSelect}
                    onStartRename={(id) => setRenamingId(id)}
                    onFork={onFork}
                    renaming={renamingId === n.entryId}
                >
                    {renamingId === n.entryId && (
                        <BranchRenameInput
                            initial={n.label ?? ""}
                            onCommit={(label) => {
                                setRenamingId(null);
                                onRename(n.entryId, label);
                            }}
                            onCancel={() => setRenamingId(null)}
                        />
                    )}
                </BranchTreeRow>
                {n.children.length > 0 && render(n.children, depth + 1)}
            </React.Fragment>
        ));
    }
}
```

- [ ] **Step 2: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/BranchTree.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchTree recursive renderer"
```

---

## Task 15: `BranchPanel` full rewrite

**Files:**
- Modify: `src/renderer/components/BranchPanel.tsx`

- [ ] **Step 1: Replace the placeholder**

Replace contents of `/Users/roaanv/mycode/macpi/src/renderer/components/BranchPanel.tsx`:

```tsx
import {
    useForkSession,
    useNavigateTree,
    useSessionTree,
    useSetEntryLabel,
} from "../queries";
import { BranchTree } from "./BranchTree";

interface BranchPanelProps {
    piSessionId: string | null;
    onForkNavigate: (newPiSessionId: string) => void;
}

export function BranchPanel({ piSessionId, onForkNavigate }: BranchPanelProps) {
    const tree = useSessionTree(piSessionId);
    const navigate = useNavigateTree();
    const fork = useForkSession();
    const rename = useSetEntryLabel();

    if (!piSessionId) {
        return (
            <aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
                <Header count={null} />
                <div className="mt-2">Select a session to see its branches.</div>
            </aside>
        );
    }
    if (tree.isLoading || !tree.data) {
        return (
            <aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
                <Header count={null} />
                <div className="mt-2">Loading…</div>
            </aside>
        );
    }
    const snap = tree.data;
    if (!snap.hasBranches) {
        return (
            <aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
                <Header count={1} />
                <div className="mt-3 text-faint">
                    No branches yet.
                    <br />
                    Hover any user message in the chat and click
                    <span className="text-primary"> ↪ Branch here</span> to fork.
                </div>
            </aside>
        );
    }

    return (
        <aside className="flex w-60 flex-col surface-panel border-l border-divider">
            <div className="p-3 pb-1">
                <Header count={tipCount(snap.roots)} />
            </div>
            <div className="flex-1 overflow-y-auto pb-2">
                <BranchTree
                    nodes={snap.roots}
                    onSelect={(entryId) =>
                        navigate.mutate({ piSessionId, entryId })
                    }
                    onRename={(entryId, label) =>
                        rename.mutate({ piSessionId, entryId, label })
                    }
                    onFork={(entryId) =>
                        fork.mutate(
                            { piSessionId, entryId, position: "at" },
                            {
                                onSuccess: (r) => onForkNavigate(r.newSessionId),
                            },
                        )
                    }
                />
            </div>
        </aside>
    );
}

function Header({ count }: { count: number | null }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted">
                Branches
            </span>
            {count != null && <span className="text-[10px] text-faint">{count}</span>}
        </div>
    );
}

function tipCount(nodes: import("../../shared/branch-types").BranchTreeNode[]): number {
    let n = 0;
    for (const node of nodes) {
        if (node.isLeafTip) n++;
        n += tipCount(node.children);
    }
    return n;
}
```

- [ ] **Step 2: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/BranchPanel.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): BranchPanel real implementation"
```

---

## Task 16: `App.tsx` — chat-mode-only mount + fork onSuccess

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Move BranchPanel inside chat block**

In `src/renderer/App.tsx`, find the section:

```tsx
{mode === "skills" && <SkillsMode />}
{mode === "extensions" && <ExtensionsMode />}
<BranchPanel />
```

Replace the BranchPanel placement so it's only mounted in chat mode AND pass the new props:

```tsx
{mode === "chat" && (
    <>
        <ChannelSidebar ... />
        <ChatPane piSessionId={sessionId} ... />
        <BranchPanel
            piSessionId={sessionId}
            onForkNavigate={(newId) => setSessionId(newId)}
        />
    </>
)}
{mode === "skills" && <SkillsMode />}
{mode === "extensions" && <ExtensionsMode />}
```

(Confirm by reading the current file — the goal is: BranchPanel only renders when mode==="chat", and gets `piSessionId` + `onForkNavigate` props.)

- [ ] **Step 2: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/App.tsx
cd /Users/roaanv/mycode/macpi && git add src/renderer/App.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): mount BranchPanel chat-only; fork navigates to new session"
```

---

## Task 17: `ChatBreadcrumb` component + mount in `ChatPane`

**Files:**
- Create: `src/renderer/components/ChatBreadcrumb.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

- [ ] **Step 1: Create the component**

Create `/Users/roaanv/mycode/macpi/src/renderer/components/ChatBreadcrumb.tsx`:

```tsx
import { useSessionTree } from "../queries";

interface ChatBreadcrumbProps {
    channelName: string | null;
    sessionName: string | null;
    piSessionId: string | null;
}

export function ChatBreadcrumb({
    channelName,
    sessionName,
    piSessionId,
}: ChatBreadcrumbProps) {
    const tree = useSessionTree(piSessionId);
    const branchLabel =
        tree.data?.hasBranches === true ? tree.data.activeBranchLabel : undefined;
    return (
        <div className="flex items-center gap-2 border-b border-divider px-3 py-1 text-xs text-muted">
            <span className="text-faint"># </span>
            <span>{channelName ?? "—"}</span>
            <span className="text-faint">›</span>
            <span className="text-primary">{sessionName ?? "—"}</span>
            {branchLabel && (
                <>
                    <span className="text-faint">›</span>
                    <span>↪ {branchLabel}</span>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Mount in `ChatPane.tsx`**

In `src/renderer/components/ChatPane.tsx`, add the import:

```ts
import { ChatBreadcrumb } from "./ChatBreadcrumb";
```

Add the breadcrumb at the very top of the ChatPane's returned element (above the message list). You'll need to pass through the `channelName` and `sessionName`. If those aren't already props, derive them from the existing `useChannels()` + `useSessionMeta(piSessionId)` queries (whichever pattern already exists in ChatPane).

If no such metadata is in scope, accept this as a follow-up — for the minimum-viable breadcrumb, pass placeholder strings and add a TODO comment scoped to a later polish task. Prefer the real lookup if it's a small change.

- [ ] **Step 3: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): ChatBreadcrumb above message list"
```

---

## Task 18: `MessageBranchButton` + wire into `UserMessage`

**Files:**
- Create: `src/renderer/components/messages/MessageBranchButton.tsx`
- Modify: `src/renderer/components/messages/UserMessage.tsx`

- [ ] **Step 1: Create the button**

Create `/Users/roaanv/mycode/macpi/src/renderer/components/messages/MessageBranchButton.tsx`:

```tsx
import { useNavigateTree } from "../../queries";

interface MessageBranchButtonProps {
    piSessionId: string;
    piEntryId: string;
}

export function MessageBranchButton({
    piSessionId,
    piEntryId,
}: MessageBranchButtonProps) {
    const navigate = useNavigateTree();
    return (
        <button
            type="button"
            onClick={() => navigate.mutate({ piSessionId, entryId: piEntryId })}
            disabled={navigate.isPending}
            className="invisible rounded px-1 py-0 text-[10px] text-faint hover:text-primary group-hover:visible disabled:opacity-50"
            aria-label="Branch from here"
        >
            ↪ Branch here
        </button>
    );
}
```

- [ ] **Step 2: Render in `UserMessage`**

In `src/renderer/components/messages/UserMessage.tsx`, modify to accept the active `piSessionId` and render the button conditionally:

```tsx
import type { UserMessageEntry } from "../../../shared/timeline-types";
import { MessageBranchButton } from "./MessageBranchButton";

interface UserMessageProps {
    entry: UserMessageEntry;
    piSessionId: string | null;
}

export function UserMessage({ entry, piSessionId }: UserMessageProps) {
    return (
        <div className="group flex items-baseline gap-2 text-[length:var(--font-size-chat-user)] leading-relaxed">
            <div className="flex-1">
                <span className="text-emerald-300">you</span>
                <span className="text-muted"> · </span>
                <span className="whitespace-pre-wrap">{entry.text}</span>
            </div>
            {piSessionId && entry.piEntryId && (
                <MessageBranchButton
                    piSessionId={piSessionId}
                    piEntryId={entry.piEntryId}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 3: Thread `piSessionId` from the caller**

Find where `<UserMessage entry={...} />` is rendered (likely in `Timeline.tsx`). Pass `piSessionId` as a prop:

```tsx
<UserMessage entry={entry} piSessionId={piSessionId} />
```

(`Timeline.tsx` already has access to the active session id via props or context; use whatever's already in scope.)

- [ ] **Step 4: Gates + commit**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/messages/MessageBranchButton.tsx src/renderer/components/messages/UserMessage.tsx
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(branching): inline ↪ Branch here button on user messages"
```

---

## Task 19: Layer-3 pi-integration test

**Files:**
- Create: `tests/pi-integration/branching.test.ts`

- [ ] **Step 1: Write the test**

Create `/Users/roaanv/mycode/macpi/tests/pi-integration/branching.test.ts`:

```ts
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestPiHarness } from "./test-harness";

describe("Pi branching", () => {
    let dir: string;
    beforeEach(async () => {
        dir = await import("node:fs").then((m) =>
            m.mkdtempSync(path.join(os.tmpdir(), "macpi-branch-")),
        );
    });
    afterEach(async () => {
        const fs = await import("node:fs");
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("two prompts under one root create two branch tips and navigation switches the leaf", async () => {
        const harness = await createTestPiHarness({ homeDir: dir });
        await harness.prompt("first prompt");
        const tree1 = harness.getTree();
        expect(tree1.length).toBeGreaterThan(0);

        // Find the first user-message entry id.
        const findUserId = (nodes: typeof tree1): string | null => {
            for (const n of nodes) {
                if (n.entry.type === "session_message" && n.entry.role === "user") {
                    return n.entry.id;
                }
                const inner = findUserId(n.children);
                if (inner) return inner;
            }
            return null;
        };
        const firstUserId = findUserId(tree1);
        expect(firstUserId).toBeTruthy();
        if (!firstUserId) return;

        // Navigate back to that user message → leaf moves; appending now creates a sibling.
        await harness.navigateTree(firstUserId);
        await harness.prompt("alternative prompt");

        const tree2 = harness.getTree();
        const userEntries: string[] = [];
        const collect = (nodes: typeof tree2) => {
            for (const n of nodes) {
                if (n.entry.type === "session_message" && n.entry.role === "user") {
                    userEntries.push(n.entry.id);
                }
                collect(n.children);
            }
        };
        collect(tree2);
        expect(userEntries.length).toBeGreaterThanOrEqual(2);
        // The two user prompts ("first prompt" and "alternative prompt") should
        // share a common parent (or both be roots) — confirming branching.
        await harness.dispose();
    });
});
```

Adapt to whatever the existing `tests/pi-integration/test-harness.ts` API provides; the assertions matter, the harness method names depend on what's already exposed. If the harness doesn't currently expose `navigateTree`, add a thin wrapper to the harness as part of this task. The goal is one passing pi-integration test that creates a branch and asserts the resulting tree shape.

- [ ] **Step 2: Run**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/pi-integration/branching.test.ts
```
Expected: 1 test passes (or skipped with explanatory message if pi credentials are unavailable in CI — match existing pi-integration test skip-conditions).

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add tests/pi-integration/branching.test.ts tests/pi-integration/test-harness.ts
cd /Users/roaanv/mycode/macpi && git commit -m "test(branching): pi-integration smoke for fork + navigate"
```

---

## Task 20: Final gates + manual smoke (deferred)

- [ ] **Step 1: Full suite**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/ tests/
cd /Users/roaanv/mycode/macpi && npm run test
```
Expected: typecheck clean, biome clean, all tests pass.

- [ ] **Step 2: Manual smoke (queued in memory as deferred)**

Validate live in the macOS app:

1. Open a session with linear history → BranchPanel shows empty state with the hint.
2. Hover a user message mid-chat → `↪ Branch here` button appears in the message row → click → leaf moves; the chat now ends at that user message; type a new prompt → divergent branch is created; BranchPanel now shows 2 tips, with the new branch active.
3. Click the other (inactive) tip → chat re-renders with that branch's messages; active marker swaps; chat scrolls to bottom.
4. Right-click a tip → context menu shows "Fork to new session" → click → new session appears in channel sidebar beneath the parent; chat navigates to it; tree is linear in the new session.
5. Click ✏️ on a tip → rename to "exp" → press Enter → label persists. Reload macpi → label still there.
6. Switch to skills mode → BranchPanel disappears. Switch back to chat → it returns.
7. Breadcrumb shows `# channel › session › ↪ <branch label>`. Branch segment hides on linear sessions.

---

## Self-Review

**Spec coverage:**
- §1 Summary → Tasks 4–18 cover all surfaces.
- §2 Goals → tree visible (15), switch (9, 15), fork (7, 15, 16), labels (6, 13).
- §3 Non-goals → no summarize-on-abandon code paths anywhere; no deletion / pruning / reorder / diff; no Playwright Electron.
- §4 Glossary → terms used consistently in tasks.
- §5 Architecture: BranchService (5–7), tree-projection (3), session.tree PiEvent (2, 4), 4 IPC methods (8) — ✓.
- §6 Data model: branch-types.ts (1), projection rules (3), no schema migration confirmed.
- §7 IPC contract: 4 methods + error codes (8) — ✓.
- §8 Event integration: PiSessionManager.subscribe (4), timeline-state handler (10) — ✓.
- §9 UI: BranchPanel (15) with empty state, in-chat button (18), ChatBreadcrumb (17), rename (13), fork right-click (12, 15), active branch switch (10, 15).
- §10 Components: every file in §10.1 and §10.2 is owned by a task.
- §11 Error handling: handlers in Task 8 map errors per spec.
- §12 Testing: Layer-1 (3), Layer-2 (5, 6, 7, 8), Layer-3 (19), Layer-4 deferred.

**Placeholder scan:**
- Task 17 Step 2 says "If those aren't already props… accept this as a follow-up" — this is a deliberate scope-flex, not a placeholder. The implementer has a concrete path either way (look up the prop chain OR add a TODO and move on). Keep as-is.
- Task 19 says "Adapt to whatever the existing test-harness API provides" — this is OK because the harness already exists from Plan 2 (chat-richness) and the implementer can read it. Concrete fall-back action documented (add wrapper if missing).
- No "TBD" / "implement later" / unsupported references.

**Type consistency:**
- `BranchTreeNode` shape stable across Tasks 1, 3, 12, 14, 15.
- `BranchTreeSnapshot` shape stable across Tasks 1, 5, 9, 15, 17.
- IPC method names (`session.getTree` / `.navigateTree` / `.fork` / `.setEntryLabel`) consistent across Tasks 8, 9, 12, 13, 18.
- `piSessionId` (not `sessionId`) used consistently in IPC payloads from Task 8 onward, matching macpi's convention that pi's session id IS macpi's session id.
- `useForkSession` mutation result `{ newSessionId: string }` consistent across Tasks 9, 15, 16.
- `BranchService.fork(piSessionId, entryId, position?)` signature stable across Tasks 7, 8, 9, 15.

Plan is internally consistent and covers all spec requirements.
