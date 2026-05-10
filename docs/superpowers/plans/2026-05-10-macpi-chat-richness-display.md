# macpi Chat Richness (display layer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the chat pane up to the spec's §8 surface in *display-only* form. Every event pi emits during a turn shows up in the UI: assistant text and thinking, tool calls (collapsed-by-default with expand-to-show output/diff), retry & compaction banners, and a read-only queue pill row. Every new event type also gets a deterministic Layer-3 test using pi's built-in faux provider.

**Architecture:** Pi already runs in main process (decision D3 was reversed during foundation). This plan does *not* introduce a separate process. We expand `PiEvent` into a fully-typed discriminated union in `src/shared/pi-events.ts`, expand `PiSessionManager`'s subscribe handler to translate `AgentSessionEvent → PiEvent`, and on the renderer side replace the trivial `messages: ChatMessage[]` state with an ordered `TimelineEntry[]` that mixes assistant text, thinking, and tool blocks. Banners read separately-tracked transient state. **No new IPC methods** — all work flows through the existing `macpi:pi-event` channel.

**Tech Stack:** Same as foundation. Adds `@earendil-works/pi-ai` as a devDependency for the layer-3 harness (the project's runtime already pulls it in transitively, but devDependencies make the test imports explicit and warning-free). Tests use Vitest's existing config; nothing new there.

**Out of scope for this plan (lands in plan 3):**

- Composer **Steer** / **Queue** buttons. Plan 2 displays the queue but doesn't let the user act on it.
- Branching UI (`SessionTreeEvent` consumption, right-click "branch from here", click-to-switch-active-branch). Branching needs new IPC methods + interactive state plumbing — coherent as its own plan.

**Carried forward from foundation (read this — it bites otherwise):**

1. **Pi runs in main process.** Decision D3 was revised. There's no utility process. PiSessionManager owns sessions in-process; long tool calls block main's event loop. Acceptable, called out, will be revisited.
2. **Pi-coding-agent is ESM-only.** Static `import { ... } from "@earendil-works/pi-coding-agent"` in main bundle compiles to `require()` and fails at runtime. Use **dynamic `import()` cached behind a helper**, like `pi-session-manager.ts` does today. `import type { ... }` is fine because types are erased.
3. **`node:sqlite` row casts.** Any new repo or query that returns rows must cast as `as unknown as RowType` because of `SQLOutputValue`. Don't omit the `unknown` step.
4. **`@earendil-works/*` packages must stay externalized in `vite.main.config.ts`.** They resolve to `node_modules` at runtime so pi can find its templates/themes/wasm.

---

## File structure created or modified

```
src/
  shared/
    pi-events.ts                      # NEW — typed PiEvent discriminated union
  main/
    pi-session-manager.ts             # MODIFIED — expand event forwarding
  renderer/
    types/
      timeline.ts                     # NEW — TimelineEntry type
    state/
      timeline-state.ts               # NEW — useTimeline() hook (consumes pi events)
    components/
      ChatPane.tsx                    # MODIFIED — use timeline + banners
      Timeline.tsx                    # NEW — renders entries in order
      messages/
        UserMessage.tsx               # NEW
        AssistantMessage.tsx          # NEW — text + collapsible thinking subblock
        ToolBlock.tsx                 # NEW — collapsed/expanded shell + sub-renderers
      banners/
        CompactionBanner.tsx          # NEW
        RetryBanner.tsx               # NEW
        QueuePills.tsx                # NEW (display-only; plan 3 wires Steer/Queue actions)
    utils/
      unified-diff.ts                 # NEW — minimal old/new → unified diff lines
      truncate-output.ts              # NEW — first/last N lines for bash output

tests/
  pi-integration/                     # NEW — Layer 3
    test-harness.ts                   # NEW — registerFauxProvider + manager wiring
    text-streaming.test.ts            # NEW
    tool-events.test.ts               # NEW
    thinking.test.ts                  # NEW
    banners.test.ts                   # NEW (retry + compaction + queue)
```

The renderer/messages/ folder may grow further in plan 3 (branch-from-message context menu); we keep the components small and focused so plan 3 only adds a wrapper.

---

## Conventions for this plan

- **Project root** is `/Users/roaanv/mycode/macpi` (or whichever worktree the engineer is in — substitute the path everywhere). The foundation milestone tag is `v0.1-foundation`.
- **TDD** for the pi-integration tests and the pure utility helpers (`unified-diff.ts`, `truncate-output.ts`). UI components don't get tests in this plan — Playwright Electron lands in plan 5.
- **Conventional commits**: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `build:` with parenthesised scope (e.g. `feat(timeline): …`).
- **Run `npm run format && npm run lint && npm run typecheck && npm test` before each commit.** No skipping. Biome will reformat — let it.
- **Pi event names verified against** `pi/packages/coding-agent/docs/json.md` (research-only, at `/Users/roaanv/opensource/pi/packages/coding-agent/docs/json.md`). If the installed `@earendil-works/pi-coding-agent ^0.74` runtime types differ, fix against the package's `dist/index.d.ts`. **Do not invent event field names.**
- **All commands run from the project root** unless stated otherwise.

---

## Phase A — Layer-3 test harness

### Task 1: Add the pi-integration directory + dev dependency

**Files:**
- Create: `tests/pi-integration/.gitkeep`
- Modify: `package.json` (devDependencies)

This task only adds infrastructure — no behavior, no test yet.

- [ ] **Step 1: Add `@earendil-works/pi-ai` as a devDependency**

```bash
npm install --save-dev @earendil-works/pi-ai@^0.74
```

(It's already pulled in transitively by `@earendil-works/pi-coding-agent`. Listing it explicitly makes the harness imports unambiguous and silences any "use of transitive dep" warnings.)

- [ ] **Step 2: Create the directory marker**

```bash
mkdir -p tests/pi-integration
touch tests/pi-integration/.gitkeep
```

- [ ] **Step 3: Verify Vitest picks up the new directory**

`vitest.config.ts` (from foundation) includes `tests/unit/**/*.test.ts` and `tests/integration/**/*.test.ts`. We want `tests/pi-integration/**/*.test.ts` too. Replace `vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: [
			"tests/unit/**/*.test.ts",
			"tests/integration/**/*.test.ts",
			"tests/pi-integration/**/*.test.ts",
		],
		passWithNoTests: true,
		coverage: { provider: "v8", reporter: ["text", "html"] },
		testTimeout: 15_000,
	},
});
```

(Slightly higher default timeout: pi spins up an `AgentSession` and the faux provider streams tokens with timing.)

- [ ] **Step 4: Verify**

```bash
npm run typecheck
npm run lint
npm test
```

All three pass. The 29 existing tests still run. No new tests yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build(test): scaffold tests/pi-integration directory and add pi-ai devDep"
```

---

### Task 2: Build the layer-3 harness helper

**Files:**
- Create: `tests/pi-integration/test-harness.ts`

The harness wires up an in-memory pi setup using `registerFauxProvider`. Each test gets a fresh manager and a `queueResponse()` function for scripting the assistant's output.

- [ ] **Step 1: Implement the harness**

Create `tests/pi-integration/test-harness.ts`:

```ts
// Layer-3 test harness for PiSessionManager. Stands up an in-memory pi-coding-agent
// using the faux provider from @earendil-works/pi-ai so tests can script assistant
// responses (text, thinking, tool calls) and assert on event forwarding.
//
// Pattern mirrors the SDK's `12-full-control.ts` example but trimmed for testing.
// All discovery is suppressed (no skills, no extensions, no AGENTS.md).

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { type PiEvent, type PiEventListener, PiSessionManager } from "../../src/main/pi-session-manager";

export interface Harness {
	manager: PiSessionManager;
	cwd: string;
	/** Queue one scripted assistant response. */
	queueResponse: (
		message: import("@earendil-works/pi-ai").AssistantMessage | (() => import("@earendil-works/pi-ai").AssistantMessage),
	) => void;
	/** Capture every event emitted by the manager. */
	captured: PiEvent[];
	/** Subscribe with a custom listener (returns unsubscribe). */
	subscribe: (listener: PiEventListener) => () => void;
	/** Tear down the harness — kill in-flight responses, free temp dirs. */
	dispose: () => void;
}

export async function createHarness(): Promise<Harness> {
	// Dynamic import: pi-ai is ESM-only (same constraint as pi-coding-agent).
	const piAi = await import("@earendil-works/pi-ai");
	const piCoding = await import("@earendil-works/pi-coding-agent");

	const fauxRegistration = piAi.registerFauxProvider({
		api: "test-faux",
		provider: "test-faux",
		models: [{ id: "faux-test-1", name: "Faux Test" }],
		// Stream a few tokens at a time, no artificial delay.
		tokenSize: { min: 2, max: 4 },
	});

	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-pi-test-"));

	// PiSessionManager loads pi via dynamic import internally. The harness
	// reaches into the same SDK to construct the in-memory dependencies pi
	// needs to skip discovery.
	const authStorage = piCoding.AuthStorage.create(path.join(cwd, "auth.json"));
	const modelRegistry = piCoding.ModelRegistry.inMemory(authStorage);

	// Inject the faux model so it shows up via `getModel("test-faux", "faux-test-1")`.
	const model = piAi.getModel("test-faux", "faux-test-1");
	if (!model) throw new Error("faux model not registered");

	// Build a minimal in-memory ResourceLoader (no skills/extensions/prompts).
	const resourceLoader = {
		getExtensions: () => ({
			extensions: [],
			errors: [],
			runtime: piCoding.createExtensionRuntime(),
		}),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => "You are a test assistant. Be concise.",
		getAppendSystemPrompt: () => [],
		extendResources: () => {},
		reload: async () => {},
	};

	const settingsManager = piCoding.SettingsManager.inMemory({
		compaction: { enabled: false },
		retry: { enabled: false },
	});

	// Replace the manager's default ensureContext with a test-configured one.
	// PiSessionManager exposes only public methods; we rebuild a thin adapter
	// here that creates sessions with the harness's fixed config.
	const manager = new PiSessionManager();

	// We override createSession via prototype pinning isn't ideal. Instead we
	// use a wrapper that knows how to drive the underlying SDK with our
	// pre-built dependencies, exposed through the same PiSessionManager API.
	// To keep PiSessionManager untouched, we attach a hidden hook used only in
	// tests:
	(manager as unknown as { __testOverrides: unknown }).__testOverrides = {
		authStorage,
		modelRegistry,
		resourceLoader,
		settingsManager,
		model,
	};

	const captured: PiEvent[] = [];
	manager.onEvent((event) => captured.push(event));

	return {
		manager,
		cwd,
		queueResponse: fauxRegistration.queueResponse,
		captured,
		subscribe: (listener) => manager.onEvent(listener),
		dispose: () => {
			manager.shutdown();
			piAi.unregisterApiProviders(fauxRegistration.api);
			fs.rmSync(cwd, { recursive: true, force: true });
		},
	};
}

/**
 * Drive a session: create it, prompt, await turn end (or timeout), return
 * captured events for that turn. Caller is responsible for queuing responses
 * BEFORE calling drive().
 */
export async function drive(
	harness: Harness,
	prompt: string,
	options: { timeoutMs?: number } = {},
): Promise<{ piSessionId: string; events: PiEvent[] }> {
	const before = harness.captured.length;
	const piSessionId = await harness.manager.createSession({ cwd: harness.cwd });
	const turnEnd = waitForEvent(
		harness,
		(e) => e.type === "session.turn_end" && e.piSessionId === piSessionId,
		options.timeoutMs ?? 10_000,
	);
	await harness.manager.prompt(piSessionId, prompt);
	await turnEnd;
	return { piSessionId, events: harness.captured.slice(before) };
}

function waitForEvent(
	harness: Harness,
	predicate: (event: PiEvent) => boolean,
	timeoutMs: number,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error(`waitForEvent timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		const unsubscribe = harness.subscribe((event) => {
			if (predicate(event)) {
				clearTimeout(timer);
				unsubscribe();
				resolve();
			}
		});
	});
}
```

> **Heads-up to engineer:** the `__testOverrides` hidden hook in this harness is a *placeholder*. PiSessionManager (foundation) hard-codes its `ensureContext` against the user's real auth/registry. To make the harness actually drive the manager with test config, **Task 4 below adds an `override(ctx)` method on PiSessionManager** that lets callers inject the dependencies. Until Task 4 lands, this harness will not work end-to-end — that's fine, Task 3 (the first test) is also gated on Task 4. We expose the marker now so the manager change in Task 4 has a known consumer.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: passes (no test imports it yet — the file just exports types and a function).

- [ ] **Step 3: Run lint and format**

```bash
npm run format
npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/pi-integration/test-harness.ts
git commit -m "test(harness): add pi-integration harness using faux provider"
```

---

## Phase B — Pi event surface expansion

### Task 3: Define the typed PiEvent union in `src/shared/pi-events.ts`

The renderer needs precise event types. Today they're inline in ChatPane. Move them to a shared module the manager and renderer both consume.

**Files:**
- Create: `src/shared/pi-events.ts`

- [ ] **Step 1: Create the file**

Replace whatever's there with:

```ts
// Wire-format events sent from main → renderer over the macpi:pi-event channel.
// PiSessionManager translates @earendil-works/pi-coding-agent's AgentSessionEvent
// into these narrower shapes; the renderer's timeline state consumes them.
//
// Source of truth for the underlying pi event names is
// pi/packages/coding-agent/docs/json.md (research-only).

export type PiEvent =
	| { type: "session.turn_start"; piSessionId: string }
	| { type: "session.turn_end"; piSessionId: string }
	| { type: "session.text_delta"; piSessionId: string; delta: string }
	| { type: "session.thinking_delta"; piSessionId: string; delta: string }
	| {
			type: "session.tool_start";
			piSessionId: string;
			toolCallId: string;
			toolName: string;
			args: unknown;
	  }
	| {
			type: "session.tool_end";
			piSessionId: string;
			toolCallId: string;
			result: unknown;
			isError: boolean;
	  }
	| {
			type: "session.compaction_start";
			piSessionId: string;
			reason: "manual" | "threshold" | "overflow";
	  }
	| {
			type: "session.compaction_end";
			piSessionId: string;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  }
	| {
			type: "session.retry_start";
			piSessionId: string;
			attempt: number;
			maxAttempts: number;
			delayMs: number;
			errorMessage: string;
	  }
	| {
			type: "session.retry_end";
			piSessionId: string;
			success: boolean;
			attempt: number;
			finalError?: string;
	  }
	| {
			type: "session.queue_update";
			piSessionId: string;
			steering: readonly string[];
			followUp: readonly string[];
	  };

export type PiEventType = PiEvent["type"];
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
```

Expected: passes. (No consumers yet — they get updated in Tasks 4 and 8.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/pi-events.ts
git commit -m "feat(events): add typed PiEvent discriminated union"
```

---

### Task 4: Expand `PiSessionManager` to forward all needed events + accept a test override

**Files:**
- Modify: `src/main/pi-session-manager.ts`

Two changes in one task:
1. Translate every `AgentSessionEvent` we care about into a `PiEvent` and emit it.
2. Add an `override(ctx)` test seam so Task 2's harness can inject in-memory dependencies.

- [ ] **Step 1: Replace `src/main/pi-session-manager.ts`**

```ts
// In-process owner of pi-coding-agent AgentSession instances. Lives in the
// Electron main process; pi runs alongside the rest of main. Direct method
// calls from the IPC router — no wire format, no correlation IDs, no
// subprocess.
//
// Loading note: pi-coding-agent's package.json exports only the "import"
// (ESM) condition — there is no "require" entry. Our Forge main bundle is
// CJS, so we cannot use a static `import` of value bindings. Instead we
// pull the module in via dynamic `import()`, cached behind ensureContext().
// The module is externalized in vite.main.config.ts so it resolves to
// node_modules at runtime and pi can find its own templates/themes/wasm.

import type {
	AgentSession,
	AuthStorage,
	ModelRegistry,
	ResourceLoader,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import type { PiEvent } from "../shared/pi-events";

type PiCodingModule = typeof import("@earendil-works/pi-coding-agent");

interface PiContext {
	mod: PiCodingModule;
	auth: AuthStorage;
	registry: ModelRegistry;
	resourceLoader?: ResourceLoader;
	settingsManager?: SettingsManager;
	model?: Model<unknown>;
}

let piPromise: Promise<PiCodingModule> | null = null;
function loadPi(): Promise<PiCodingModule> {
	if (!piPromise) piPromise = import("@earendil-works/pi-coding-agent");
	return piPromise;
}

export type PiEventListener = (event: PiEvent) => void;

interface ActiveSession {
	piSessionId: string;
	session: AgentSession;
	unsubscribe: () => void;
}

/**
 * Test-only override container. Production code always leaves this empty;
 * the layer-3 harness sets it to inject in-memory pi dependencies.
 */
export interface PiTestOverrides {
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	settingsManager: SettingsManager;
	model: Model<unknown>;
}

export { type PiEvent } from "../shared/pi-events";

export class PiSessionManager {
	private readonly active = new Map<string, ActiveSession>();
	private readonly listeners = new Set<PiEventListener>();
	private ctx: PiContext | null = null;
	/**
	 * Test-only hook. The layer-3 harness sets this before calling
	 * createSession to bypass the real auth/registry/resource discovery.
	 */
	__testOverrides: PiTestOverrides | undefined;

	onEvent(listener: PiEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async createSession(opts: { cwd: string }): Promise<string> {
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
		const unsubscribe = session.subscribe((event) => this.translate(piSessionId, event));
		this.active.set(piSessionId, { piSessionId, session, unsubscribe });
		return piSessionId;
	}

	async prompt(piSessionId: string, text: string): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		await active.session.prompt(text, { source: "interactive" });
	}

	shutdown(): void {
		for (const a of this.active.values()) a.unsubscribe();
		this.active.clear();
		this.listeners.clear();
	}

	private async ensureContext(): Promise<PiContext> {
		if (this.ctx) return this.ctx;
		const mod = await loadPi();
		const auth = mod.AuthStorage.create();
		const registry = mod.ModelRegistry.create(auth);
		this.ctx = { mod, auth, registry };
		return this.ctx;
	}

	private translate(piSessionId: string, event: unknown): void {
		const e = event as { type: string } & Record<string, unknown>;
		switch (e.type) {
			case "turn_start":
				this.emit({ type: "session.turn_start", piSessionId });
				return;
			case "turn_end":
				this.emit({ type: "session.turn_end", piSessionId });
				return;
			case "message_update": {
				const ame = (e as { assistantMessageEvent?: { type?: string; delta?: string } })
					.assistantMessageEvent;
				if (!ame || typeof ame.delta !== "string") return;
				if (ame.type === "text_delta") {
					this.emit({ type: "session.text_delta", piSessionId, delta: ame.delta });
				} else if (ame.type === "thinking_delta") {
					this.emit({ type: "session.thinking_delta", piSessionId, delta: ame.delta });
				}
				return;
			}
			case "tool_execution_start":
				this.emit({
					type: "session.tool_start",
					piSessionId,
					toolCallId: String(e.toolCallId ?? ""),
					toolName: String(e.toolName ?? ""),
					args: e.args,
				});
				return;
			case "tool_execution_end":
				this.emit({
					type: "session.tool_end",
					piSessionId,
					toolCallId: String(e.toolCallId ?? ""),
					result: e.result,
					isError: Boolean(e.isError),
				});
				return;
			case "compaction_start":
				this.emit({
					type: "session.compaction_start",
					piSessionId,
					reason: (e.reason as "manual" | "threshold" | "overflow") ?? "manual",
				});
				return;
			case "compaction_end":
				this.emit({
					type: "session.compaction_end",
					piSessionId,
					aborted: Boolean(e.aborted),
					willRetry: Boolean(e.willRetry),
					errorMessage: e.errorMessage as string | undefined,
				});
				return;
			case "auto_retry_start":
				this.emit({
					type: "session.retry_start",
					piSessionId,
					attempt: Number(e.attempt ?? 0),
					maxAttempts: Number(e.maxAttempts ?? 0),
					delayMs: Number(e.delayMs ?? 0),
					errorMessage: String(e.errorMessage ?? ""),
				});
				return;
			case "auto_retry_end":
				this.emit({
					type: "session.retry_end",
					piSessionId,
					success: Boolean(e.success),
					attempt: Number(e.attempt ?? 0),
					finalError: e.finalError as string | undefined,
				});
				return;
			case "queue_update":
				this.emit({
					type: "session.queue_update",
					piSessionId,
					steering: (e.steering as readonly string[]) ?? [],
					followUp: (e.followUp as readonly string[]) ?? [],
				});
				return;
			// Other AgentSessionEvent kinds (agent_start, agent_end, message_start,
			// message_end, tool_execution_update, session_info_changed,
			// thinking_level_changed) are intentionally ignored. Plan 3+ may
			// surface session_info_changed for the breadcrumb.
		}
	}

	private emit(event: PiEvent) {
		for (const l of this.listeners) l(event);
	}
}
```

- [ ] **Step 2: Verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

All clean. The 29 existing tests still pass (the IPC router test mocks PiSessionManager so it doesn't exercise the new translate method; that's covered in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/main/pi-session-manager.ts
git commit -m "feat(pi-events): forward full event surface + add test-override hook"
```

---

### Task 5: First layer-3 test — text streaming round-trip

**Files:**
- Create: `tests/pi-integration/text-streaming.test.ts`

Validates that a queued faux response → manager.prompt → renderer-shaped events arrive in the right order.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, drive, type Harness } from "./test-harness";

let harness: Harness;

beforeEach(async () => {
	harness = await createHarness();
});

afterEach(() => {
	harness.dispose();
});

describe("layer-3: text streaming", () => {
	it("forwards turn_start, text_delta+, turn_end for a plain text response", async () => {
		const piAi = await import("@earendil-works/pi-ai");
		harness.queueResponse(piAi.fauxAssistantMessage(piAi.fauxText("hello world")));

		const { events } = await drive(harness, "say hi");

		const types = events.map((e) => e.type);
		expect(types[0]).toBe("session.turn_start");
		expect(types[types.length - 1]).toBe("session.turn_end");
		expect(types).toContain("session.text_delta");

		const reassembled = events
			.filter((e) => e.type === "session.text_delta")
			.map((e) => (e as { delta: string }).delta)
			.join("");
		expect(reassembled).toBe("hello world");
	});

	it("does not emit text events for a thinking-only response", async () => {
		const piAi = await import("@earendil-works/pi-ai");
		harness.queueResponse(piAi.fauxAssistantMessage(piAi.fauxThinking("internal monologue")));

		const { events } = await drive(harness, "think out loud");

		const textEvents = events.filter((e) => e.type === "session.text_delta");
		expect(textEvents.length).toBe(0);
	});
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/text-streaming.test.ts
```

Expected: 2 passing tests.

If it fails because `__testOverrides` doesn't actually flow into pi: read the SDK's `12-full-control.ts` example again and confirm that the `model` and `resourceLoader` parameters are actually accepted by `createAgentSession`. If the manager change in Task 4 missed something, fix it there and re-run.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(pi-integration): text streaming round-trip via faux provider"
```

---

## Phase C — Renderer turn-timeline state

### Task 6: Define `TimelineEntry` types

**Files:**
- Create: `src/renderer/types/timeline.ts`

The chat pane will render a list of timeline entries (mixed message kinds). This task defines the union; it's pure types, no behavior.

- [ ] **Step 1: Create the file**

```ts
// A timeline entry represents one rendered block in the chat pane.
// Multiple entries can be in flight at once (assistant text streaming
// while a tool call is also in progress).

export interface UserMessageEntry {
	kind: "user";
	id: string;
	text: string;
}

export interface AssistantTextEntry {
	kind: "assistant-text";
	id: string;
	text: string;
	thinking: string;
	streaming: boolean;
}

export interface ToolCallEntry {
	kind: "tool-call";
	id: string; // = pi's toolCallId
	toolName: string;
	args: unknown;
	state: "pending" | "ok" | "error";
	result: unknown;
}

export type TimelineEntry = UserMessageEntry | AssistantTextEntry | ToolCallEntry;
```

- [ ] **Step 2: Verify and commit**

```bash
npm run typecheck
git add src/renderer/types/timeline.ts
git commit -m "feat(timeline): add TimelineEntry union types"
```

---

### Task 7: Build the `useTimeline()` hook

**Files:**
- Create: `src/renderer/state/timeline-state.ts`

A React hook that subscribes to pi events and maintains the timeline + transient banner state for one session.

- [ ] **Step 1: Implement the hook**

```ts
import React from "react";
import type { PiEvent } from "../../shared/pi-events";
import type { TimelineEntry, AssistantTextEntry, ToolCallEntry } from "../types/timeline";
import { onPiEvent } from "../ipc";

export interface QueueState {
	steering: readonly string[];
	followUp: readonly string[];
}

export interface RetryState {
	attempt: number;
	maxAttempts: number;
	errorMessage: string;
}

export interface CompactionState {
	reason: "manual" | "threshold" | "overflow";
}

export interface TimelineSnapshot {
	timeline: TimelineEntry[];
	streaming: boolean;
	queue: QueueState;
	retry: RetryState | null;
	compaction: CompactionState | null;
	lastCompactionResult: { ok: boolean; message?: string } | null;
}

const EMPTY: TimelineSnapshot = {
	timeline: [],
	streaming: false,
	queue: { steering: [], followUp: [] },
	retry: null,
	compaction: null,
	lastCompactionResult: null,
};

let entryIdCounter = 0;
const nextEntryId = () => `e${++entryIdCounter}`;

/**
 * Subscribes to pi events for one session and maintains a derived snapshot.
 * Returns the snapshot plus an `appendUserMessage` function the chat pane
 * calls when the user clicks Send.
 *
 * Resets when piSessionId changes.
 */
export function useTimeline(piSessionId: string | null): {
	snapshot: TimelineSnapshot;
	appendUserMessage: (text: string) => void;
} {
	const [snapshot, setSnapshot] = React.useState<TimelineSnapshot>(EMPTY);

	// Reset on session change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is the only meaningful dep
	React.useEffect(() => {
		setSnapshot(EMPTY);
	}, [piSessionId]);

	React.useEffect(() => {
		if (!piSessionId) return;
		return onPiEvent((raw) => {
			const e = raw as PiEvent;
			if (e.piSessionId !== piSessionId) return;
			setSnapshot((prev) => reduce(prev, e));
		});
	}, [piSessionId]);

	const appendUserMessage = React.useCallback((text: string) => {
		setSnapshot((prev) => ({
			...prev,
			streaming: true,
			timeline: [...prev.timeline, { kind: "user", id: nextEntryId(), text }],
		}));
	}, []);

	return { snapshot, appendUserMessage };
}

function reduce(prev: TimelineSnapshot, event: PiEvent): TimelineSnapshot {
	switch (event.type) {
		case "session.turn_start":
			return { ...prev, streaming: true };
		case "session.turn_end":
			return {
				...prev,
				streaming: false,
				timeline: prev.timeline.map((entry) =>
					entry.kind === "assistant-text" && entry.streaming
						? { ...entry, streaming: false }
						: entry,
				),
			};
		case "session.text_delta":
			return appendOrPatchAssistantText(prev, event.delta, "text");
		case "session.thinking_delta":
			return appendOrPatchAssistantText(prev, event.delta, "thinking");
		case "session.tool_start":
			return {
				...prev,
				timeline: [
					...prev.timeline,
					{
						kind: "tool-call",
						id: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						state: "pending",
						result: null,
					} satisfies ToolCallEntry,
				],
			};
		case "session.tool_end":
			return {
				...prev,
				timeline: prev.timeline.map((entry) =>
					entry.kind === "tool-call" && entry.id === event.toolCallId
						? { ...entry, state: event.isError ? "error" : "ok", result: event.result }
						: entry,
				),
			};
		case "session.queue_update":
			return {
				...prev,
				queue: { steering: event.steering, followUp: event.followUp },
			};
		case "session.retry_start":
			return {
				...prev,
				retry: {
					attempt: event.attempt,
					maxAttempts: event.maxAttempts,
					errorMessage: event.errorMessage,
				},
			};
		case "session.retry_end":
			return { ...prev, retry: null };
		case "session.compaction_start":
			return {
				...prev,
				compaction: { reason: event.reason },
				lastCompactionResult: null,
			};
		case "session.compaction_end":
			return {
				...prev,
				compaction: null,
				lastCompactionResult: event.aborted
					? { ok: false, message: event.errorMessage }
					: { ok: true },
			};
		default:
			return prev;
	}
}

function appendOrPatchAssistantText(
	prev: TimelineSnapshot,
	delta: string,
	field: "text" | "thinking",
): TimelineSnapshot {
	const last = prev.timeline[prev.timeline.length - 1];
	if (last && last.kind === "assistant-text" && last.streaming) {
		const patched: AssistantTextEntry = { ...last, [field]: last[field] + delta };
		return {
			...prev,
			timeline: [...prev.timeline.slice(0, -1), patched],
		};
	}
	const created: AssistantTextEntry = {
		kind: "assistant-text",
		id: nextEntryId(),
		text: field === "text" ? delta : "",
		thinking: field === "thinking" ? delta : "",
		streaming: true,
	};
	return { ...prev, timeline: [...prev.timeline, created] };
}
```

- [ ] **Step 2: Verify**

```bash
npm run format
npm run lint
npm run typecheck
```

Expected: clean. (Tests come in Task 8 alongside the ChatPane refactor.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/state/timeline-state.ts
git commit -m "feat(timeline): add useTimeline() hook (text + thinking + tool calls + banners)"
```

---

### Task 8: Refactor `ChatPane.tsx` to use the timeline hook (text only for now)

**Files:**
- Modify: `src/renderer/components/ChatPane.tsx`
- Create: `src/renderer/components/Timeline.tsx`
- Create: `src/renderer/components/messages/UserMessage.tsx`
- Create: `src/renderer/components/messages/AssistantMessage.tsx`

We swap the inline `messages` state for `useTimeline()`. Tool blocks render as `[tool: <name>]` placeholders for now — the `ToolBlock` component lands in Task 9.

- [ ] **Step 1: Create `src/renderer/components/messages/UserMessage.tsx`**

```tsx
import type { UserMessageEntry } from "../../types/timeline";

export function UserMessage({ entry }: { entry: UserMessageEntry }) {
	return (
		<div className="text-sm leading-relaxed">
			<span className="text-emerald-300">you</span>
			<span className="text-zinc-500"> · </span>
			<span className="whitespace-pre-wrap">{entry.text}</span>
		</div>
	);
}
```

- [ ] **Step 2: Create `src/renderer/components/messages/AssistantMessage.tsx`**

```tsx
import React from "react";
import type { AssistantTextEntry } from "../../types/timeline";

export function AssistantMessage({ entry }: { entry: AssistantTextEntry }) {
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const hasThinking = entry.thinking.length > 0;
	const showThinking = thinkingOpen || (hasThinking && entry.streaming && !entry.text);

	return (
		<div className="text-sm leading-relaxed">
			<span className="text-amber-300">pi</span>
			<span className="text-zinc-500"> · </span>
			{hasThinking && (
				<button
					type="button"
					onClick={() => setThinkingOpen((open) => !open)}
					className="mr-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
				>
					{showThinking ? "▾ thinking" : "▸ thinking"}
				</button>
			)}
			{showThinking && (
				<div className="my-1 border-l-2 border-zinc-700 pl-2 text-xs italic text-zinc-400 whitespace-pre-wrap">
					{entry.thinking}
				</div>
			)}
			<span className="whitespace-pre-wrap">{entry.text}</span>
		</div>
	);
}
```

- [ ] **Step 3: Create `src/renderer/components/Timeline.tsx`**

```tsx
import type { TimelineEntry } from "../types/timeline";
import { AssistantMessage } from "./messages/AssistantMessage";
import { UserMessage } from "./messages/UserMessage";

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
	return (
		<div className="my-3 flex flex-1 flex-col gap-3 overflow-y-auto">
			{entries.map((entry) => {
				switch (entry.kind) {
					case "user":
						return <UserMessage key={entry.id} entry={entry} />;
					case "assistant-text":
						return <AssistantMessage key={entry.id} entry={entry} />;
					case "tool-call":
						return (
							<div
								key={entry.id}
								className="rounded border-l-2 border-zinc-600 bg-zinc-900/40 px-2 py-1 font-mono text-[11px] text-zinc-400"
							>
								🔧 {entry.toolName}
								<span className="ml-2 text-zinc-600">[ToolBlock arrives in Task 9]</span>
							</div>
						);
				}
			})}
		</div>
	);
}
```

- [ ] **Step 4: Replace `src/renderer/components/ChatPane.tsx`**

```tsx
// Main chat area. Subscribes to pi events via useTimeline() and renders the
// resulting timeline. Banners and queue pills are wired in Phase E/F.

import React from "react";
import { usePromptSession } from "../queries";
import { useTimeline } from "../state/timeline-state";
import { Timeline } from "./Timeline";

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
	const { snapshot, appendUserMessage } = useTimeline(piSessionId);
	const [input, setInput] = React.useState("");
	const promptMutation = usePromptSession();

	if (!piSessionId) {
		return (
			<div className="flex flex-1 items-center justify-center text-zinc-500">
				Select a session, or create one in the sidebar.
			</div>
		);
	}

	async function send(e: React.FormEvent) {
		e.preventDefault();
		const text = input.trim();
		if (!text || snapshot.streaming || !piSessionId) return;
		setInput("");
		appendUserMessage(text);
		try {
			await promptMutation.mutateAsync({ piSessionId, text });
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
			<form onSubmit={send} className="flex gap-2 rounded bg-zinc-900 p-2">
				<input
					className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
					placeholder={snapshot.streaming ? "streaming…" : "Type a message"}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					disabled={snapshot.streaming}
				/>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
					disabled={snapshot.streaming || !input.trim()}
				>
					Send
				</button>
			</form>
		</div>
	);
}
```

- [ ] **Step 5: Verify**

```bash
npm run format
npm run lint
npm run typecheck
npm test
```

Expected: clean. 29 + 2 (text-streaming) tests pass.

- [ ] **Step 6: Manual smoke check**

`npm start`. Send a prompt. Confirm streaming text still works (regression check). Close.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(chat): replace inline messages state with useTimeline() + Timeline"
```

---

## Phase D — Tool blocks

### Task 9: ToolBlock component shell

**Files:**
- Create: `src/renderer/components/messages/ToolBlock.tsx`
- Modify: `src/renderer/components/Timeline.tsx`

The shell handles collapsed/expanded state and border colors. Per-tool body rendering comes in Tasks 10–13.

- [ ] **Step 1: Create `ToolBlock.tsx` (shell only — every tool renders as JSON for now)**

```tsx
import React from "react";
import type { ToolCallEntry } from "../../types/timeline";

const BORDERS: Record<ToolCallEntry["state"], string> = {
	pending: "border-blue-500",
	ok: "border-emerald-500",
	error: "border-red-500",
};

export function ToolBlock({ entry }: { entry: ToolCallEntry }) {
	const [open, setOpen] = React.useState(false);

	return (
		<div
			className={`rounded border-l-2 ${BORDERS[entry.state]} bg-zinc-900/40 px-2 py-1 font-mono text-[11px] text-zinc-300`}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-2 text-left"
			>
				<span>{open ? "▾" : "▸"}</span>
				<span className="text-zinc-400">🔧 {entry.toolName}</span>
				<span className="ml-auto text-zinc-500">
					{entry.state === "pending" && "running…"}
					{entry.state === "ok" && "✓"}
					{entry.state === "error" && "✘"}
				</span>
			</button>
			{open && (
				<div className="mt-2 space-y-2">
					<DetailSection label="args">
						<pre className="whitespace-pre-wrap text-zinc-400">
							{JSON.stringify(entry.args, null, 2)}
						</pre>
					</DetailSection>
					{entry.state !== "pending" && (
						<DetailSection label={entry.state === "ok" ? "result" : "error"}>
							<pre
								className={`whitespace-pre-wrap ${entry.state === "error" ? "text-red-300" : "text-zinc-300"}`}
							>
								{typeof entry.result === "string"
									? entry.result
									: JSON.stringify(entry.result, null, 2)}
							</pre>
						</DetailSection>
					)}
				</div>
			)}
		</div>
	);
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[9px] uppercase tracking-widest text-zinc-500">{label}</div>
			<div className="mt-0.5">{children}</div>
		</div>
	);
}
```

- [ ] **Step 2: Wire `ToolBlock` into `Timeline.tsx`**

Replace the placeholder `case "tool-call":` block with:

```tsx
case "tool-call":
    return <ToolBlock key={entry.id} entry={entry} />;
```

And add the import:

```tsx
import { ToolBlock } from "./messages/ToolBlock";
```

- [ ] **Step 3: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tool-block): add ToolBlock with collapsed/expanded states (generic JSON renderer)"
```

---

### Task 10: Per-tool collapsed-summary line for `bash`, `read`, `grep`, `find`, `ls`

**Files:**
- Modify: `src/renderer/components/messages/ToolBlock.tsx`
- Create: `src/renderer/utils/truncate-output.ts`

The collapsed line shows a one-line summary. Expanded body still uses the JSON fallback for these (we only do bash output truncation here; rich diff for edit/write lands in Task 11).

- [ ] **Step 1: Create the truncation helper**

```ts
// src/renderer/utils/truncate-output.ts
//
// Bash output truncation: keep the first FIRST and last LAST lines if total > MAX.
// Returns the original string when no truncation needed.

export interface TruncatedOutput {
	text: string;
	truncated: boolean;
	totalLines: number;
}

const FIRST = 100;
const LAST = 100;
const MAX = 200;

export function truncateOutput(input: string): TruncatedOutput {
	const lines = input.split(/\r?\n/);
	if (lines.length <= MAX) {
		return { text: input, truncated: false, totalLines: lines.length };
	}
	const head = lines.slice(0, FIRST).join("\n");
	const tail = lines.slice(-LAST).join("\n");
	const omitted = lines.length - FIRST - LAST;
	return {
		text: `${head}\n…[${omitted} lines truncated]…\n${tail}`,
		truncated: true,
		totalLines: lines.length,
	};
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/truncate-output.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { truncateOutput } from "../../src/renderer/utils/truncate-output";

describe("truncateOutput", () => {
	it("returns the input unchanged when under 200 lines", () => {
		const input = Array.from({ length: 150 }, (_, i) => `line${i}`).join("\n");
		const r = truncateOutput(input);
		expect(r.truncated).toBe(false);
		expect(r.text).toBe(input);
		expect(r.totalLines).toBe(150);
	});

	it("keeps the first 100 and last 100 lines when over 200", () => {
		const lines = Array.from({ length: 500 }, (_, i) => `line${i}`);
		const input = lines.join("\n");
		const r = truncateOutput(input);
		expect(r.truncated).toBe(true);
		expect(r.totalLines).toBe(500);
		expect(r.text).toContain("line0");
		expect(r.text).toContain("line99");
		expect(r.text).toContain("line400");
		expect(r.text).toContain("line499");
		expect(r.text).not.toContain("line150");
		expect(r.text).toMatch(/300 lines truncated/);
	});

	it("treats CRLF and LF the same", () => {
		const input = "a\r\nb\r\nc";
		const r = truncateOutput(input);
		expect(r.totalLines).toBe(3);
	});
});
```

- [ ] **Step 3: Run test, expect pass**

```bash
npm test -- tests/unit/truncate-output.test.ts
```

Expected: 3 passing.

- [ ] **Step 4: Add summary helpers to `ToolBlock.tsx`**

In `ToolBlock.tsx`, add a `summarize(toolName, args, result)` helper above the component and use it for the collapsed-line subtitle:

```tsx
import { truncateOutput } from "../../utils/truncate-output";

function summarize(toolName: string, args: unknown): string {
	const a = (args ?? {}) as Record<string, unknown>;
	switch (toolName) {
		case "bash":
			return clip(String(a.command ?? ""), 80);
		case "read":
			return [a.path, a.startLine && `lines ${a.startLine}-${a.endLine ?? a.startLine}`]
				.filter(Boolean)
				.join(" · ");
		case "grep":
			return `${String(a.pattern ?? "")} in ${String(a.path ?? ".")}`;
		case "find":
			return String(a.pattern ?? "");
		case "ls":
			return String(a.path ?? ".");
		case "edit":
		case "write":
			return String(a.path ?? "");
		default:
			return "";
	}
}

function clip(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
```

Update the collapsed-line button to render the summary:

```tsx
<button
    type="button"
    onClick={() => setOpen((o) => !o)}
    className="flex w-full items-center gap-2 text-left"
>
    <span>{open ? "▾" : "▸"}</span>
    <span className="text-zinc-400">🔧 {entry.toolName}:</span>
    <span className="text-zinc-300 truncate">{summarize(entry.toolName, entry.args)}</span>
    <span className="ml-auto text-zinc-500">
        {entry.state === "pending" && "running…"}
        {entry.state === "ok" && "✓"}
        {entry.state === "error" && "✘"}
    </span>
</button>
```

Update the result section to truncate string outputs:

```tsx
{entry.state !== "pending" && (
    <DetailSection label={entry.state === "ok" ? "result" : "error"}>
        <pre
            className={`whitespace-pre-wrap ${entry.state === "error" ? "text-red-300" : "text-zinc-300"}`}
        >
            {(() => {
                if (typeof entry.result === "string") {
                    return truncateOutput(entry.result).text;
                }
                if (entry.result && typeof entry.result === "object" && "stdout" in entry.result) {
                    // bash result shape: { stdout, stderr, exitCode, durationMs }
                    const r = entry.result as { stdout?: string; stderr?: string; exitCode?: number };
                    const stdout = r.stdout ? truncateOutput(r.stdout).text : "";
                    const stderr = r.stderr ? `\n--stderr--\n${truncateOutput(r.stderr).text}` : "";
                    return `${stdout}${stderr}\n--exit ${r.exitCode ?? "?"}--`;
                }
                return JSON.stringify(entry.result, null, 2);
            })()}
        </pre>
    </DetailSection>
)}
```

- [ ] **Step 5: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All clean. Test count is 29 (foundation) + 2 (text-streaming) + 3 (truncate) = 34.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tool-block): per-tool collapsed summaries + bash/read truncation"
```

---

### Task 11: Diff rendering for `edit` and `write` tools

**Files:**
- Create: `src/renderer/utils/unified-diff.ts`
- Modify: `src/renderer/components/messages/ToolBlock.tsx`

We render an inline +/- diff. Pi's edit/write result usually contains `oldText`/`newText` (edit) or just `content` (write — rendered as all-additions). Implement a tiny side-table renderer.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/unified-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { unifiedDiffLines } from "../../src/renderer/utils/unified-diff";

describe("unifiedDiffLines", () => {
	it("returns equal lines for identical input", () => {
		const r = unifiedDiffLines("a\nb\nc", "a\nb\nc");
		expect(r.every((l) => l.kind === "equal")).toBe(true);
		expect(r.length).toBe(3);
	});

	it("emits remove + add for a single-line replacement", () => {
		const r = unifiedDiffLines("foo\nbar", "foo\nbaz");
		expect(r.map((l) => l.kind)).toEqual(["equal", "remove", "add"]);
		expect(r[1].text).toBe("bar");
		expect(r[2].text).toBe("baz");
	});

	it("treats new-file as all additions when oldText is empty", () => {
		const r = unifiedDiffLines("", "x\ny\nz");
		expect(r.map((l) => l.kind)).toEqual(["add", "add", "add"]);
	});

	it("treats deletion as all removals when newText is empty", () => {
		const r = unifiedDiffLines("x\ny", "");
		expect(r.map((l) => l.kind)).toEqual(["remove", "remove"]);
	});
});
```

- [ ] **Step 2: Run, expect fail**

```bash
npm test -- tests/unit/unified-diff.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `unified-diff.ts`**

```ts
// Minimal LCS-based unified-diff line renderer. Used to render edit/write
// tool results inline in the chat. Not intended for general purpose use.

export type DiffKind = "equal" | "add" | "remove";

export interface DiffLine {
	kind: DiffKind;
	text: string;
}

export function unifiedDiffLines(oldText: string, newText: string): DiffLine[] {
	const oldLines = oldText.length > 0 ? oldText.split(/\r?\n/) : [];
	const newLines = newText.length > 0 ? newText.split(/\r?\n/) : [];

	const lcs = computeLcs(oldLines, newLines);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	for (const m of lcs) {
		while (i < m.aIndex) out.push({ kind: "remove", text: oldLines[i++] });
		while (j < m.bIndex) out.push({ kind: "add", text: newLines[j++] });
		out.push({ kind: "equal", text: oldLines[i] });
		i++;
		j++;
	}
	while (i < oldLines.length) out.push({ kind: "remove", text: oldLines[i++] });
	while (j < newLines.length) out.push({ kind: "add", text: newLines[j++] });
	return out;
}

interface Match {
	aIndex: number;
	bIndex: number;
}

/** Standard LCS-via-DP, returning the matching indices in order. */
function computeLcs(a: string[], b: string[]): Match[] {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const matches: Match[] = [];
	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (a[i] === b[j]) {
			matches.push({ aIndex: i, bIndex: j });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return matches;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
npm test -- tests/unit/unified-diff.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Render diffs in `ToolBlock.tsx`**

Add at the top:

```tsx
import { type DiffLine, unifiedDiffLines } from "../../utils/unified-diff";
```

Add a helper function below the component:

```tsx
function diffFromArgs(toolName: string, args: unknown): DiffLine[] | null {
	const a = (args ?? {}) as Record<string, unknown>;
	if (toolName === "edit" && typeof a.oldText === "string" && typeof a.newText === "string") {
		return unifiedDiffLines(a.oldText, a.newText);
	}
	if (toolName === "write" && typeof a.content === "string") {
		return unifiedDiffLines("", a.content);
	}
	return null;
}

function DiffView({ lines }: { lines: DiffLine[] }) {
	return (
		<div className="overflow-x-auto rounded bg-zinc-950/40 p-2 font-mono text-[10px] leading-relaxed">
			{lines.map((line, i) => (
				<div
					key={i}
					className={
						line.kind === "add"
							? "bg-emerald-900/30 text-emerald-200"
							: line.kind === "remove"
								? "bg-red-900/30 text-red-200"
								: "text-zinc-400"
					}
				>
					<span className="mr-2 text-zinc-500">
						{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}
					</span>
					{line.text || " "}
				</div>
			))}
		</div>
	);
}
```

In the expanded body (after `args` section), if a diff is available render it instead of the JSON args:

```tsx
{(() => {
    const diff = diffFromArgs(entry.toolName, entry.args);
    if (diff) {
        return (
            <DetailSection label="diff">
                <DiffView lines={diff} />
            </DetailSection>
        );
    }
    return (
        <DetailSection label="args">
            <pre className="whitespace-pre-wrap text-zinc-400">
                {JSON.stringify(entry.args, null, 2)}
            </pre>
        </DetailSection>
    );
})()}
```

- [ ] **Step 6: Verify and commit**

```bash
npm run format && npm run lint && npm run typecheck && npm test
git add -A
git commit -m "feat(tool-block): inline diff rendering for edit/write tool calls"
```

---

### Task 12: tool-events layer-3 test

**Files:**
- Create: `tests/pi-integration/tool-events.test.ts`

Verify that a faux response containing a `toolCall` produces matching `session.tool_start` + `session.tool_end` events.

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, drive, type Harness } from "./test-harness";

let harness: Harness;

beforeEach(async () => {
	harness = await createHarness();
});

afterEach(() => {
	harness.dispose();
});

describe("layer-3: tool events", () => {
	it("emits session.tool_start and session.tool_end for a tool call", async () => {
		const piAi = await import("@earendil-works/pi-ai");
		harness.queueResponse(
			piAi.fauxAssistantMessage([
				piAi.fauxText("checking files"),
				piAi.fauxToolCall("ls", { path: "." }, { id: "tool-1" }),
			]),
		);
		// The faux provider needs a follow-up response after the tool result
		// arrives. Queue a final text-only message.
		harness.queueResponse(piAi.fauxAssistantMessage(piAi.fauxText("done")));

		const { events } = await drive(harness, "list files");

		const start = events.find(
			(e) => e.type === "session.tool_start" && (e as { toolCallId: string }).toolCallId === "tool-1",
		);
		const end = events.find(
			(e) => e.type === "session.tool_end" && (e as { toolCallId: string }).toolCallId === "tool-1",
		);
		expect(start).toBeTruthy();
		expect(end).toBeTruthy();
		expect((start as { toolName: string }).toolName).toBe("ls");
	});
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/tool-events.test.ts
```

Expected: 1 passing test.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(pi-integration): assert tool_start/tool_end forwarding for tool calls"
```

---

## Phase E — Thinking blocks (test only — UI lands as part of Task 8 already)

### Task 13: thinking layer-3 test

The renderer already handles thinking deltas via `useTimeline()` and `AssistantMessage`. We just need a regression test that the events flow end-to-end.

**Files:**
- Create: `tests/pi-integration/thinking.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, drive, type Harness } from "./test-harness";

let harness: Harness;

beforeEach(async () => {
	harness = await createHarness();
});

afterEach(() => {
	harness.dispose();
});

describe("layer-3: thinking deltas", () => {
	it("forwards session.thinking_delta for thinking content", async () => {
		const piAi = await import("@earendil-works/pi-ai");
		harness.queueResponse(
			piAi.fauxAssistantMessage([
				piAi.fauxThinking("hmm let me think"),
				piAi.fauxText("the answer is 42"),
			]),
		);

		const { events } = await drive(harness, "what is the meaning of life?");

		const thinkingBuf = events
			.filter((e) => e.type === "session.thinking_delta")
			.map((e) => (e as { delta: string }).delta)
			.join("");
		const textBuf = events
			.filter((e) => e.type === "session.text_delta")
			.map((e) => (e as { delta: string }).delta)
			.join("");

		expect(thinkingBuf).toBe("hmm let me think");
		expect(textBuf).toBe("the answer is 42");
	});
});
```

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/thinking.test.ts
```

Expected: 1 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/pi-integration/thinking.test.ts
git commit -m "test(pi-integration): assert thinking_delta forwarding"
```

---

## Phase F — Banners and queue pills

### Task 14: RetryBanner + CompactionBanner + QueuePills components

**Files:**
- Create: `src/renderer/components/banners/RetryBanner.tsx`
- Create: `src/renderer/components/banners/CompactionBanner.tsx`
- Create: `src/renderer/components/banners/QueuePills.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`

- [ ] **Step 1: Create `RetryBanner.tsx`**

```tsx
import type { RetryState } from "../../state/timeline-state";

export function RetryBanner({ retry }: { retry: RetryState | null }) {
	if (!retry) return null;
	return (
		<div className="rounded border-l-2 border-amber-500 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
			Retrying ({retry.attempt}/{retry.maxAttempts})… {retry.errorMessage}
		</div>
	);
}
```

- [ ] **Step 2: Create `CompactionBanner.tsx`**

```tsx
import type {
	CompactionState,
	TimelineSnapshot,
} from "../../state/timeline-state";

export function CompactionBanner({
	compaction,
	lastResult,
}: {
	compaction: CompactionState | null;
	lastResult: TimelineSnapshot["lastCompactionResult"];
}) {
	if (compaction) {
		return (
			<div className="rounded border-l-2 border-sky-500 bg-sky-900/30 px-3 py-2 text-xs text-sky-200">
				Compacting… ({compaction.reason})
			</div>
		);
	}
	if (!lastResult) return null;
	if (lastResult.ok) {
		return (
			<div className="rounded border-l-2 border-emerald-500 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
				Compacted ✓
			</div>
		);
	}
	return (
		<div className="rounded border-l-2 border-red-500 bg-red-900/30 px-3 py-2 text-xs text-red-200">
			Compaction failed: {lastResult.message ?? "(no message)"}
		</div>
	);
}
```

- [ ] **Step 3: Create `QueuePills.tsx`**

```tsx
import type { QueueState } from "../../state/timeline-state";

export function QueuePills({ queue }: { queue: QueueState }) {
	const total = queue.steering.length + queue.followUp.length;
	if (total === 0) return null;
	return (
		<div className="flex flex-wrap gap-1 rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
			{queue.steering.map((q, i) => (
				<span
					key={`steer-${i}`}
					className="rounded bg-indigo-900/60 px-2 py-0.5"
					title={q}
				>
					steered: {ellipsize(q, 24)}
				</span>
			))}
			{queue.followUp.map((q, i) => (
				<span
					key={`follow-${i}`}
					className="rounded bg-zinc-700 px-2 py-0.5"
					title={q}
				>
					queued: {ellipsize(q, 24)}
				</span>
			))}
		</div>
	);
}

function ellipsize(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
```

- [ ] **Step 4: Wire banners into `ChatPane.tsx`**

Imports:

```tsx
import { CompactionBanner } from "./banners/CompactionBanner";
import { QueuePills } from "./banners/QueuePills";
import { RetryBanner } from "./banners/RetryBanner";
```

Insert above the composer form (between the Timeline and the form):

```tsx
<div className="mt-2 space-y-2">
    <RetryBanner retry={snapshot.retry} />
    <CompactionBanner
        compaction={snapshot.compaction}
        lastResult={snapshot.lastCompactionResult}
    />
    <QueuePills queue={snapshot.queue} />
</div>
```

- [ ] **Step 5: Verify**

```bash
npm run format && npm run lint && npm run typecheck && npm test
```

All clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(banners): retry + compaction + queue pills (display only)"
```

---

### Task 15: banners layer-3 test

The retry / compaction / queue events come from pi's session-level lifecycle (not the AI provider directly). Test by simulating a retryable failure: queue a faux response that throws, then a recovery response. The faux provider's error response should trigger pi's retry path (provided we enable retry in the harness — currently disabled in `test-harness.ts` to keep other tests deterministic).

We split into a dedicated test file with retry enabled.

**Files:**
- Create: `tests/pi-integration/banners.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHarness, drive, type Harness } from "./test-harness";

// These tests need pi's auto-retry and compaction behavior, which the default
// harness disables for determinism. We rebuild a harness inline with both
// enabled so the lifecycle events fire.

describe("layer-3: banners", () => {
	let harness: Harness | null = null;

	afterEach(() => {
		harness?.dispose();
		harness = null;
	});

	it("emits retry_start when the provider returns an error and retry is enabled", async () => {
		harness = await createHarness();
		// Re-enable retry on the harness's settings manager.
		const piCoding = await import("@earendil-works/pi-coding-agent");
		const overrides = (harness.manager as unknown as { __testOverrides: { settingsManager: unknown } }).__testOverrides;
		overrides.settingsManager = piCoding.SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: true, maxRetries: 2 },
		});

		const piAi = await import("@earendil-works/pi-ai");
		// First attempt fails (no responses queued -> faux emits error)
		// Second attempt succeeds.
		harness.queueResponse(piAi.fauxAssistantMessage(piAi.fauxText("recovered"), { stopReason: "stop" }));
		// Drive — pi will see the first call fail (no response left after we
		// shift the only one we queued), retry, then succeed.
		// Per faux's design, calling once consumes our queued response. So
		// to *force* a failure first we queue zero, but that means the first
		// attempt fails with "no responses queued" and pi retries; on retry
		// we need a response to be available.
		// Practical approach: don't pre-queue, then queue once after a small
		// delay so the first attempt fails and the retry succeeds.

		// Vitest fake timers are unreliable here (pi uses setTimeout). Use a
		// real microtask to queue mid-flight:
		const queueLater = (delayMs: number) =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					harness?.queueResponse(piAi.fauxAssistantMessage(piAi.fauxText("recovered")));
					resolve();
				}, delayMs),
			);
		void queueLater(50);

		const { events } = await drive(harness, "trigger retry", { timeoutMs: 8_000 });

		const retryStart = events.find((e) => e.type === "session.retry_start");
		expect(retryStart, `expected at least one retry_start. saw types: ${events.map((e) => e.type).join(",")}`).toBeTruthy();
	});
});
```

> **Engineer note:** if the faux provider's error path doesn't trigger pi's retry — i.e., `retry_start` never fires even with retry enabled — pi may differentiate between "transient provider error" (retried) and "no-response error" (not retried). In that case, replace the queue-later strategy with a custom `FauxResponseFactory` that throws on `state.callCount === 0` and returns a real message on `callCount === 1`. The faux provider supports passing a function instead of a message; see `tests/pi-integration/test-harness.ts` for the type. Update this test once you've confirmed which shape pi actually retries on.

- [ ] **Step 2: Run, expect pass**

```bash
npm test -- tests/pi-integration/banners.test.ts
```

Expected: 1 passing. **If it doesn't pass**, follow the engineer note above and adjust the failure-injection mechanism. Report back if pi turns out not to emit retry events for the faux-provider errors at all — that's a finding worth surfacing.

- [ ] **Step 3: Commit**

```bash
git add tests/pi-integration/banners.test.ts
git commit -m "test(pi-integration): smoke retry_start emission with retry enabled"
```

---

## Phase G — Manual smoke test

### Task 16: End-to-end smoke against real Codex auth

This is a manual checkpoint that validates the chat-richness display against a real model. The implementer drives it; results go in the commit message of the merge back to main.

- [ ] **Step 1: Confirm Codex auth still works**

```bash
ls ~/.pi/agent/auth.json
```

- [ ] **Step 2: Launch macpi**

```bash
npm start
```

Window opens, terminal stays visible.

- [ ] **Step 3: Walk a tool-using prompt**

1. Pick or create a channel.
2. Create a session.
3. Send: `read the README.md and summarise it`.

**Expect:**
- An assistant message appears.
- A `🔧 read: README.md` block appears, expandable.
- Expanded view shows the content (or a truncated tail if huge).
- Final summary text streams.
- No banners triggered (no retry/compaction expected on a small read).

- [ ] **Step 4: Walk a thinking-capable prompt (if your provider supports it)**

Send: `think hard about whether 137 is prime, then answer yes or no`.

**Expect:** if the model is thinking-capable (Sonnet 4.5+/Opus 4.x with thinking on), a collapsible `▸ thinking` chip appears above the answer. Click to expand. If your provider doesn't expose thinking, this step is a no-op — note it and move on.

- [ ] **Step 5: Walk an edit prompt (touches diff rendering)**

Send: `add a top-level heading "# macpi" to README.md`.

**Expect:** an `🔧 edit: README.md` block. Expanded view shows a +/- diff.

- [ ] **Step 6: Tag**

If steps 3–5 all worked:

```bash
git tag v0.2-chat-richness -m "macpi chat richness display layer"
```

- [ ] **Step 7: Report**

If anything failed at steps 3–5, capture:
- Step number that failed
- Last 30 lines of the terminal where `npm start` is running
- Any DevTools Console errors
- Screenshots of the chat pane state at failure (optional but helpful)

---

## Self-review checklist

The plan author has run this checklist. Engineers executing the plan should re-run it after each phase.

- **Spec coverage** (against §8 of the design spec):
  - Token deltas → already covered in foundation; reaffirmed via Task 5 ✓
  - Thinking deltas → Tasks 4, 7, 8, 13 ✓
  - Tool blocks (bash/read/edit/write/grep/find/ls) → Tasks 9, 10, 11, 12 ✓
  - Custom tools (generic JSON renderer fallback) → Task 9 (the default branch) ✓
  - Retry banner → Tasks 4, 14, 15 ✓
  - Compaction banner → Tasks 4, 14 ✓ (no dedicated layer-3 test; covered by manual smoke)
  - Queue pills (display only) → Tasks 4, 14 ✓
  - Streaming model state machine → Task 7 (useTimeline reducer) ✓
  - Composer Steer/Queue → **deferred to plan 3** (called out at top)
  - Branching panel → **deferred to plan 3** (called out at top)

- **Placeholder scan**: Searched for "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "similar to Task". Two annotated engineer-notes call out *known* uncertainty (the `__testOverrides` shape in Task 2, the retry trigger in Task 15) — both with explicit guidance for the engineer. Neither is a hidden incomplete bit.

- **Type consistency**:
  - `PiEvent` discriminator strings are identical across `src/shared/pi-events.ts` and `src/main/pi-session-manager.ts`'s `translate()` (Tasks 3 and 4). All `session.*` prefixed.
  - `TimelineEntry` kinds — `user`, `assistant-text`, `tool-call` — match between `src/renderer/types/timeline.ts`, the reducer in `useTimeline()`, and the renderers in `Timeline.tsx`/`ToolBlock.tsx` (Tasks 6–9).
  - `useTimeline()` returns `{ snapshot, appendUserMessage }` — used unchanged in Task 8's ChatPane and re-used in Task 14 banners.
  - `unifiedDiffLines` returns `DiffLine[]` with `kind: "equal" | "add" | "remove"` — same union in Task 11 helper and `DiffView` consumer.

- **Cross-task references**:
  - Task 5 depends on Task 4's `__testOverrides`. Stated explicitly at Task 2 step 1's heads-up note.
  - Task 14 banners read state set by the reducer in Task 7. Field names (`retry`, `compaction`, `lastCompactionResult`, `queue`) match.
  - Tests run in the order they're written; later tests don't reference earlier ones except for the shared `test-harness.ts`.

- **Carried-forward items honored**:
  - Pi loaded via dynamic `import()` in `pi-session-manager.ts` — Task 4 keeps the pattern, harness in Task 2 mirrors it.
  - Externalization of `@earendil-works/*` — no changes to `vite.main.config.ts`. ✓
  - No new repos in this plan — no `node:sqlite` row casts needed.

---

## Done criteria

The chat-richness display milestone is complete when:

1. All tasks 1–16 are committed.
2. `make test` (Layers 1+2) passes.
3. `npm test` runs all suites including pi-integration: target 36 tests (29 foundation + 3 truncate + 4 unified-diff = 36 unit/integration; plus 4 pi-integration = 40 total).
4. The Task 16 smoke against real Codex auth succeeds at steps 3 and 5 (thinking optional).
5. Tag `v0.2-chat-richness` exists.

After that: pause, review, then write Plan 3 (interactive richness — Steer/Queue + branching) against the as-built code.
