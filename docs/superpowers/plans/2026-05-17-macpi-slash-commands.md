# Slash Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add slash-command support to the chat Composer: autocomplete popup, prompt-template expansion, seven built-in commands, and `/skill:<name>` passthrough.

**Architecture:** Pure-function `src/renderer/slash/` modules (`parse`, `expand`, `registry`, `templates`, `skills`, `dispatch`) wrap the SlashAction contract. The Composer detects the trigger, renders `<SlashPopup>`, and interprets dispatcher actions. One new IPC method (`session.compact` wrapping pi SDK's `compact`). One new app-level primitive: a minimal `ToastHost` + `useToast` hook for transient feedback.

**Tech Stack:** Electron 42, TypeScript, React 18, TanStack Query 5, Tailwind v3, Vitest 3, Biome v2, `@earendil-works/pi-coding-agent` SDK.

**Spec:** `docs/superpowers/specs/2026-05-17-slash-commands-design.md`.

---

## Pre-flight

Branch `slash-commands` is already created (HEAD `f9e07c4` — spec doc).

```bash
npm install
npm run typecheck && npm run lint && npm test
```

Expected baseline: typecheck clean, biome clean, **400/400 tests passing**.

**Heads-up:** the in-editor LSP shows false positives. **`npm run typecheck` is the ground truth** — ignore IDE-LSP noise.

**Spec adjustment landed during planning:** the spec mentioned a new `prompts.readBody` IPC, but the existing `prompts.read` IPC already returns `{manifest, body}`. The plan uses `prompts.read`; no new prompts IPC is needed.

---

## File Structure

```
src/renderer/slash/
  types.ts                                               [NEW]
  parse.ts                                               [NEW]
  expand.ts                                              [NEW]
  registry.ts                                            [NEW]
  templates.ts                                           [NEW]
  skills.ts                                              [NEW]
  dispatch.ts                                            [NEW]

src/renderer/hooks/
  use-toast.ts                                           [NEW]

src/renderer/components/
  ToastHost.tsx                                          [NEW]
  SlashPopup.tsx                                         [NEW]
  HelpDialog.tsx                                         [NEW]
  Composer.tsx                                           [MODIFY: trigger detection, popup wiring, dispatch loop, new props]
  ChatPane.tsx                                           [MODIFY: pass channelId, lastAssistantText, openHelpDialog, etc.; mount HelpDialog]
  App.tsx                                                [MODIFY: mount <ToastHost /> once at root]

src/main/
  pi-session-manager.ts                                  [MODIFY: +compact(piSessionId, prompt?)]
  ipc-router.ts                                          [MODIFY: +session.compact handler]

src/shared/
  ipc-types.ts                                           [MODIFY: +session.compact method type]

tests/
  unit/slash-parse.test.ts                               [NEW]
  unit/slash-expand.test.ts                              [NEW]
  unit/slash-registry.test.ts                            [NEW]
  unit/slash-dispatch.test.ts                            [NEW]
  unit/slash-templates.test.ts                           [NEW]
  unit/slash-popup.test.tsx                              [NEW]
  unit/use-toast.test.tsx                                [NEW]
  integration/ipc-router.test.ts                         [MODIFY: stub session.compact]
```

15 tasks total. Each ends with a passing test + commit.

---

## Phase A — Pure helpers

### Task 1: Types module

**Files:**
- Create: `src/renderer/slash/types.ts`

- [ ] **Step 1: Implement (no test — types only, exercised by all later tasks)**

```ts
// Contract types for the slash-command pipeline. The SlashAction union is
// the boundary between the dispatcher (pure) and the Composer (React-stateful).

import type { IpcMethodName } from "../../shared/ipc-types";

export interface SlashCommand {
	/** Command name without the leading slash. e.g. "compact", "review". */
	name: string;
	description: string;
	/** e.g. "[prompt]", "<text>". Omitted when the command takes no args. */
	argumentHint?: string;
	kind: "builtin" | "template" | "skill";
	/** False = blocked during streaming; true = always available. */
	availableDuringStream: boolean;
}

export interface ParsedSlash {
	/** Name without the leading slash. May contain ":" (for /skill:name). */
	name: string;
	args: string[];
}

export type SlashAction =
	| { kind: "replace"; text: string }
	| { kind: "send"; text: string }
	| { kind: "run"; effect: () => void | Promise<void> }
	| { kind: "ipc"; method: IpcMethodName; args: unknown }
	| { kind: "block"; reason: string };

export interface SlashDispatchCtx {
	streaming: boolean;
	piSessionId: string;
	channelId: string | null;
	lastAssistantText: () => string | null;
	openHelpDialog: () => void;
	showToast: (message: string) => void;
	clearComposerInput: () => void;
	onSessionCreated: (newPiSessionId: string) => void;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/slash/types.ts
git commit -m "feat(slash): contract types (SlashCommand, ParsedSlash, SlashAction, SlashDispatchCtx)"
```

---

### Task 2: parse.ts — input string → ParsedSlash | null

**Files:**
- Create: `src/renderer/slash/parse.ts`
- Create: `tests/unit/slash-parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { parse } from "../../src/renderer/slash/parse";

describe("parse", () => {
	it("returns null for input that doesn't start with /", () => {
		expect(parse("foo")).toBeNull();
		expect(parse(" /foo")).toBeNull();
		expect(parse("")).toBeNull();
	});

	it("returns empty name for bare slash", () => {
		expect(parse("/")).toEqual({ name: "", args: [] });
	});

	it("parses a name with no args", () => {
		expect(parse("/foo")).toEqual({ name: "foo", args: [] });
	});

	it("parses space-separated args", () => {
		expect(parse("/foo bar baz")).toEqual({ name: "foo", args: ["bar", "baz"] });
	});

	it("preserves double-quoted spans as a single arg", () => {
		expect(parse('/foo "a b" c')).toEqual({ name: "foo", args: ["a b", "c"] });
	});

	it("allows a colon in the name (for /skill:name)", () => {
		expect(parse("/skill:fmt")).toEqual({ name: "skill:fmt", args: [] });
		expect(parse("/skill:fmt arg1")).toEqual({
			name: "skill:fmt",
			args: ["arg1"],
		});
	});

	it("returns null when a newline appears before the first space", () => {
		expect(parse("/foo\nbar")).toBeNull();
	});

	it("collapses runs of whitespace inside unquoted regions", () => {
		expect(parse("/foo   bar    baz")).toEqual({
			name: "foo",
			args: ["bar", "baz"],
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-parse.test.ts
```

Expected: FAIL — `Cannot find module '../../src/renderer/slash/parse'`.

- [ ] **Step 3: Implement `src/renderer/slash/parse.ts`**

```ts
// Tokenises composer input into a slash command + args. Returns null if
// the input isn't a slash trigger (doesn't start with "/" or has a
// newline before the first arg-separator space — the first-line-only
// rule from the spec).

import type { ParsedSlash } from "./types";

export function parse(input: string): ParsedSlash | null {
	if (!input.startsWith("/")) return null;

	// Find first space (= name/args separator) and first newline.
	const firstSpace = indexOfWhitespace(input);
	const firstNewline = input.indexOf("\n");
	// If a newline appears before the first space (or there's no space at
	// all but there's a newline), the trigger isn't on line 1.
	if (firstNewline !== -1 && (firstSpace === -1 || firstNewline < firstSpace)) {
		return null;
	}

	const name = (firstSpace === -1 ? input.slice(1) : input.slice(1, firstSpace))
		.trim();
	const rest = firstSpace === -1 ? "" : input.slice(firstSpace + 1);
	const args = tokeniseArgs(rest);
	return { name, args };
}

/** Index of the first whitespace character (space, tab) — NOT newline. */
function indexOfWhitespace(s: string): number {
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === " " || c === "\t") return i;
	}
	return -1;
}

function tokeniseArgs(rest: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < rest.length) {
		// Skip whitespace.
		while (i < rest.length && /\s/.test(rest[i])) i++;
		if (i >= rest.length) break;
		// Quoted span.
		if (rest[i] === '"') {
			i++;
			let buf = "";
			while (i < rest.length && rest[i] !== '"') {
				buf += rest[i];
				i++;
			}
			if (i < rest.length) i++; // skip closing quote
			out.push(buf);
			continue;
		}
		// Bare token.
		let buf = "";
		while (i < rest.length && !/\s/.test(rest[i])) {
			buf += rest[i];
			i++;
		}
		if (buf.length > 0) out.push(buf);
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-parse.test.ts
```

Expected: PASS — all 8 test cases green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/parse.ts tests/unit/slash-parse.test.ts
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/slash/parse.ts tests/unit/slash-parse.test.ts
git commit -m "feat(slash): parse — input → ParsedSlash with first-line rule + quoted args"
```

---

### Task 3: expand.ts — template body interpolation

**Files:**
- Create: `src/renderer/slash/expand.ts`
- Create: `tests/unit/slash-expand.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { expand } from "../../src/renderer/slash/expand";

describe("expand", () => {
	it("substitutes $1, $2 positional args (1-indexed)", () => {
		expect(expand("hi $1, $2", ["alice", "bob"])).toBe("hi alice, bob");
	});

	it("renders missing positional args as empty string", () => {
		expect(expand("hi $1 $2 $3", ["alice"])).toBe("hi alice  ");
	});

	it("substitutes $@ and $ARGUMENTS with all args space-joined", () => {
		expect(expand("run: $@", ["a", "b", "c"])).toBe("run: a b c");
		expect(expand("run: $ARGUMENTS", ["a", "b"])).toBe("run: a b");
	});

	it("substitutes ${@:N} for args from position N", () => {
		expect(expand("$0 ${@:2}", ["a", "b", "c", "d"])).toBe("$0 b c d");
	});

	it("substitutes ${@:N:L} for L args from position N", () => {
		expect(expand("${@:2:2}", ["a", "b", "c", "d"])).toBe("b c");
	});

	it("leaves unknown $identifier untouched", () => {
		expect(expand("price: $foo", [])).toBe("price: $foo");
	});

	it("returns empty string for ${@:N} when N is past end", () => {
		expect(expand("[${@:5}]", ["a", "b"])).toBe("[]");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-expand.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/renderer/slash/expand.ts`**

```ts
// Interpolates pi-style prompt-template variables. The grammar matches
// pi-coding-agent's prompt-templates spec:
//   $1, $2, …       positional args (1-indexed)
//   $@ or $ARGUMENTS  all args, space-joined
//   ${@:N}          args from N to end, space-joined
//   ${@:N:L}        L args starting at N, space-joined
// Unknown identifiers (e.g. "$foo") are left literal.

export function expand(body: string, args: string[]): string {
	// Order matters: ${@:N:L} first (most specific), then ${@:N}, then
	// $@/$ARGUMENTS, then $N. Otherwise $@ would shadow ${@:N}.
	let out = body;

	out = out.replace(/\$\{@:(\d+):(\d+)\}/g, (_, nStr, lStr) => {
		const n = Number.parseInt(nStr, 10);
		const l = Number.parseInt(lStr, 10);
		// 1-indexed N; slice is 0-indexed.
		return args.slice(n - 1, n - 1 + l).join(" ");
	});
	out = out.replace(/\$\{@:(\d+)\}/g, (_, nStr) => {
		const n = Number.parseInt(nStr, 10);
		return args.slice(n - 1).join(" ");
	});
	out = out.replace(/\$ARGUMENTS\b/g, () => args.join(" "));
	out = out.replace(/\$@/g, () => args.join(" "));
	out = out.replace(/\$(\d+)/g, (_, nStr) => {
		const n = Number.parseInt(nStr, 10);
		return args[n - 1] ?? "";
	});

	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-expand.test.ts
```

Expected: PASS — all 7 test cases green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/expand.ts tests/unit/slash-expand.test.ts
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/slash/expand.ts tests/unit/slash-expand.test.ts
git commit -m "feat(slash): expand — pi-style \$1/\$@/\${@:N:L} template interpolation"
```

---

### Task 4: registry.ts — built-in commands + match

**Files:**
- Create: `src/renderer/slash/registry.ts`
- Create: `tests/unit/slash-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { builtinCommands, match } from "../../src/renderer/slash/registry";
import type { SlashCommand } from "../../src/renderer/slash/types";

describe("builtinCommands", () => {
	it("returns the documented 7 built-ins", () => {
		const cmds = builtinCommands();
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual([
			"clear",
			"compact",
			"copy",
			"help",
			"name",
			"new",
			"reload",
		]);
	});

	it("marks /compact and /reload as not-available during stream", () => {
		const cmds = builtinCommands();
		const compact = cmds.find((c) => c.name === "compact");
		const reload = cmds.find((c) => c.name === "reload");
		expect(compact?.availableDuringStream).toBe(false);
		expect(reload?.availableDuringStream).toBe(false);
	});

	it("marks the other 5 as available during stream", () => {
		const cmds = builtinCommands();
		for (const name of ["help", "clear", "copy", "new", "name"]) {
			expect(cmds.find((c) => c.name === name)?.availableDuringStream).toBe(true);
		}
	});
});

describe("match", () => {
	const sample: SlashCommand[] = [
		{ name: "help", description: "", kind: "builtin", availableDuringStream: true },
		{ name: "clear", description: "", kind: "builtin", availableDuringStream: true },
		{ name: "compact", description: "", kind: "builtin", availableDuringStream: false },
		{ name: "copy", description: "", kind: "builtin", availableDuringStream: true },
	];

	it("returns all input commands when query is empty, sorted alpha", () => {
		expect(match("", sample).map((c) => c.name)).toEqual([
			"clear",
			"compact",
			"copy",
			"help",
		]);
	});

	it("ranks exact-prefix matches before substring matches", () => {
		// "co" prefix-matches /compact and /copy; "co" doesn't appear inside any other name.
		// /compact and /copy both prefix-match; alpha order between them = compact, copy.
		expect(match("co", sample).map((c) => c.name)).toEqual(["compact", "copy"]);
	});

	it("matches case-insensitively", () => {
		expect(match("CO", sample).map((c) => c.name)).toEqual(["compact", "copy"]);
	});

	it("returns [] when nothing matches", () => {
		expect(match("xyz", sample)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/slash/registry.ts`**

```ts
// Built-in command catalogue + match function. Both are pure so the
// Composer can rebuild matches on every render without caching.

import type { SlashCommand } from "./types";

export function builtinCommands(): SlashCommand[] {
	return [
		{
			name: "help",
			description: "Show all available slash commands",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "clear",
			description: "Clear the composer text",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "copy",
			description: "Copy the last assistant message to the clipboard",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "new",
			description: "Start a new session in this channel",
			argumentHint: "[cwd]",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "name",
			description: "Rename the current session",
			argumentHint: "<text>",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "compact",
			description: "Compact the conversation history",
			argumentHint: "[prompt]",
			kind: "builtin",
			availableDuringStream: false,
		},
		{
			name: "reload",
			description: "Reload skills, extensions, prompts for this session",
			kind: "builtin",
			availableDuringStream: false,
		},
	];
}

export function match(query: string, commands: SlashCommand[]): SlashCommand[] {
	const q = query.toLowerCase();
	if (q === "") {
		return [...commands].sort((a, b) => a.name.localeCompare(b.name));
	}

	const prefix: SlashCommand[] = [];
	const substring: SlashCommand[] = [];
	for (const cmd of commands) {
		const n = cmd.name.toLowerCase();
		if (n.startsWith(q)) prefix.push(cmd);
		else if (n.includes(q)) substring.push(cmd);
	}
	prefix.sort((a, b) => a.name.localeCompare(b.name));
	substring.sort((a, b) => a.name.localeCompare(b.name));
	return [...prefix, ...substring];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-registry.test.ts
```

Expected: PASS — 7 cases green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/registry.ts tests/unit/slash-registry.test.ts
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/slash/registry.ts tests/unit/slash-registry.test.ts
git commit -m "feat(slash): registry — 7 built-ins + match (prefix > substring > alpha)"
```

---

## Phase B — Adapters

### Task 5: templates.ts — PromptSummary → SlashCommand + dispatchTemplate

**Files:**
- Create: `src/renderer/slash/templates.ts`
- Create: `tests/unit/slash-templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import {
	dispatchTemplate,
	templateCommands,
} from "../../src/renderer/slash/templates";
import type { PromptSummary } from "../../src/shared/prompts-types";

const prompt: PromptSummary = {
	id: "review",
	name: "review",
	description: "Review a PR",
	argumentHint: "<PR-URL>",
	source: "/u/p/prompts/review.md",
	relativePath: "review.md",
	enabled: true,
};

describe("templateCommands", () => {
	it("maps a PromptSummary to a SlashCommand with kind=template", () => {
		const [cmd] = templateCommands([prompt]);
		expect(cmd).toMatchObject({
			name: "review",
			description: "Review a PR",
			argumentHint: "<PR-URL>",
			kind: "template",
			availableDuringStream: true,
		});
	});

	it("returns an empty array for an empty input", () => {
		expect(templateCommands([])).toEqual([]);
	});
});

describe("dispatchTemplate", () => {
	it("returns {kind:'replace'} with expanded body on success", async () => {
		const invoke = vi.fn().mockResolvedValue({
			manifest: {
				name: "review",
				description: "Review",
				source: "",
				relativePath: "review.md",
			},
			body: "Review $1 thoroughly.",
		});
		const action = await dispatchTemplate(
			prompt,
			["https://example.com/pr/1"],
			invoke as unknown as <M>(m: M, a: unknown) => Promise<unknown>,
		);
		expect(invoke).toHaveBeenCalledWith("prompts.read", { id: "review" });
		expect(action).toEqual({
			kind: "replace",
			text: "Review https://example.com/pr/1 thoroughly.",
		});
	});

	it("returns a {kind:'run'} toast effect when the IPC throws", async () => {
		const invoke = vi.fn().mockRejectedValue(new Error("boom"));
		const action = await dispatchTemplate(
			prompt,
			[],
			invoke as unknown as <M>(m: M, a: unknown) => Promise<unknown>,
		);
		expect(action.kind).toBe("run");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-templates.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/renderer/slash/templates.ts`**

```ts
// Adapter between the prompts service and the slash registry. Two pieces:
// templateCommands (synchronous shape mapping for the popup) and
// dispatchTemplate (async — fetches the body via IPC, expands args,
// returns a replace-action for the Composer).

import type { PromptSummary } from "../../shared/prompts-types";
import { expand } from "./expand";
import type { SlashAction, SlashCommand } from "./types";

export function templateCommands(prompts: PromptSummary[]): SlashCommand[] {
	return prompts.map((p) => ({
		name: p.name,
		description: p.description,
		argumentHint: p.argumentHint,
		kind: "template",
		availableDuringStream: true,
	}));
}

type InvokeFn = <M extends string>(method: M, args: unknown) => Promise<unknown>;

export async function dispatchTemplate(
	prompt: PromptSummary,
	args: string[],
	invoke: InvokeFn,
): Promise<SlashAction> {
	try {
		const res = (await invoke("prompts.read", { id: prompt.id })) as {
			body: string;
		};
		return { kind: "replace", text: expand(res.body, args) };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {
			kind: "run",
			effect: () => {
				// Caller is responsible for showing the toast; this fallback is
				// surfaced by the Composer.
				throw new Error(`Template not available: ${msg}`);
			},
		};
	}
}
```

Note: the `dispatchTemplate` error fallback is intentionally minimal —
the spec calls for a toast, but `dispatchTemplate` itself can't reach
`ctx.showToast`. Task 7's `dispatch` wraps this and translates errors into
toast effects against the real ctx.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-templates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/templates.ts tests/unit/slash-templates.test.ts
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/slash/templates.ts tests/unit/slash-templates.test.ts
git commit -m "feat(slash): templates adapter + dispatchTemplate (reads body via prompts.read)"
```

---

### Task 6: skills.ts — display-only adapter for /skill:name passthrough

**Files:**
- Create: `src/renderer/slash/skills.ts`

- [ ] **Step 1: Implement (no tests — trivially derived from SkillSummary)**

```ts
// Skills appear in the popup only for discovery. Their dispatch is a
// no-op — the Composer leaves the input as plain text so pi's SDK
// parses /skill:<name> on its end. See SlashDispatcher.dispatch().
//
// Note: SkillSummary does NOT carry a description (only name, source,
// relativePath, enabled). We surface source as the secondary text so the
// user can distinguish skills with the same name from different packages.

import type { SkillSummary } from "../../shared/skills-types";
import type { SlashCommand } from "./types";

export function skillCommands(skills: SkillSummary[]): SlashCommand[] {
	return skills
		.filter((s) => s.enabled)
		.map((s) => ({
			name: `skill:${s.name}`,
			description: s.source,
			kind: "skill",
			availableDuringStream: true,
		}));
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/skills.ts
```

Expected: clean. If `SkillSummary` doesn't have `enabled` / `description` / `name` fields, adjust the body to match the actual shape (read `src/shared/skills-types.ts` first to confirm).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/slash/skills.ts
git commit -m "feat(slash): skills adapter — display-only /skill:<name> rows"
```

---

## Phase C — Dispatcher + main-process IPC

### Task 7: dispatch.ts — SlashCommand × ctx → SlashAction | null

**Files:**
- Create: `src/renderer/slash/dispatch.ts`
- Create: `tests/unit/slash-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { dispatch } from "../../src/renderer/slash/dispatch";
import type {
	ParsedSlash,
	SlashCommand,
	SlashDispatchCtx,
} from "../../src/renderer/slash/types";

function makeCtx(overrides: Partial<SlashDispatchCtx> = {}): SlashDispatchCtx {
	return {
		streaming: false,
		piSessionId: "sid",
		channelId: "ch",
		lastAssistantText: () => "hello world",
		openHelpDialog: vi.fn(),
		showToast: vi.fn(),
		clearComposerInput: vi.fn(),
		onSessionCreated: vi.fn(),
		...overrides,
	};
}

const builtin = (name: string, available = true): SlashCommand => ({
	name,
	description: "",
	kind: "builtin",
	availableDuringStream: available,
});

describe("dispatch", () => {
	it("returns block when streaming and command is not stream-available", () => {
		const ctx = makeCtx({ streaming: true });
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: [] },
			ctx,
		);
		expect(action).toMatchObject({ kind: "block" });
	});

	it("/help → run effect that calls openHelpDialog", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("help"), { name: "help", args: [] }, ctx);
		expect(action?.kind).toBe("run");
		if (action?.kind === "run") await action.effect();
		expect(ctx.openHelpDialog).toHaveBeenCalled();
	});

	it("/clear → run effect that calls clearComposerInput", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("clear"), { name: "clear", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.clearComposerInput).toHaveBeenCalled();
	});

	it("/copy with last assistant text → toast 'Copied'", async () => {
		const ctx = makeCtx();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(globalThis, "navigator", {
			value: { clipboard: { writeText } },
			configurable: true,
		});
		const action = dispatch(builtin("copy"), { name: "copy", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(writeText).toHaveBeenCalledWith("hello world");
		expect(ctx.showToast).toHaveBeenCalledWith("Copied");
	});

	it("/copy with no assistant text → toast 'Nothing to copy'", async () => {
		const ctx = makeCtx({ lastAssistantText: () => null });
		const action = dispatch(builtin("copy"), { name: "copy", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.showToast).toHaveBeenCalledWith("Nothing to copy");
	});

	it("/compact (no args) idle → ipc session.compact with no prompt", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: [] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.compact",
			args: { piSessionId: "sid", prompt: undefined },
		});
	});

	it("/compact 'force it' idle → ipc with prompt joined", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: ["force", "it"] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.compact",
			args: { piSessionId: "sid", prompt: "force it" },
		});
	});

	it("/name with args → ipc session.rename", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("name"),
			{ name: "name", args: ["my", "session"] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.rename",
			args: { piSessionId: "sid", label: "my session" },
		});
	});

	it("/name with no args → run effect toasting usage", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("name"), { name: "name", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.showToast).toHaveBeenCalledWith("Usage: /name <text>");
	});

	it("skill command → returns null (passthrough)", () => {
		const skill: SlashCommand = {
			name: "skill:fmt",
			description: "",
			kind: "skill",
			availableDuringStream: true,
		};
		const action = dispatch(skill, { name: "skill:fmt", args: [] }, makeCtx());
		expect(action).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-dispatch.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/renderer/slash/dispatch.ts`**

```ts
// Dispatcher: takes a matched SlashCommand and its parsed args, plus the
// context object the Composer hands us, and returns a SlashAction the
// Composer can interpret. Pure with respect to the inputs — all side
// effects are encoded as the action variant.

import type {
	ParsedSlash,
	SlashAction,
	SlashCommand,
	SlashDispatchCtx,
} from "./types";

export function dispatch(
	cmd: SlashCommand,
	parsed: ParsedSlash,
	ctx: SlashDispatchCtx,
): SlashAction | null {
	if (cmd.kind === "skill") return null;

	if (!cmd.availableDuringStream && ctx.streaming) {
		return {
			kind: "block",
			reason: "Wait for the agent to finish",
		};
	}

	if (cmd.kind === "builtin") {
		return dispatchBuiltin(cmd.name, parsed.args, ctx);
	}

	// Template dispatch is async and lives in templates.ts. The Composer
	// special-cases this kind because it needs to call invoke() and await.
	return null;
}

function dispatchBuiltin(
	name: string,
	args: string[],
	ctx: SlashDispatchCtx,
): SlashAction | null {
	switch (name) {
		case "help":
			return { kind: "run", effect: ctx.openHelpDialog };

		case "clear":
			return { kind: "run", effect: ctx.clearComposerInput };

		case "copy":
			return {
				kind: "run",
				effect: async () => {
					const text = ctx.lastAssistantText();
					if (!text) {
						ctx.showToast("Nothing to copy");
						return;
					}
					await navigator.clipboard.writeText(text);
					ctx.showToast("Copied");
				},
			};

		case "new":
			if (!ctx.channelId) {
				return {
					kind: "run",
					effect: () => ctx.showToast("No active channel"),
				};
			}
			return {
				kind: "ipc",
				method: "session.create",
				args: {
					channelId: ctx.channelId,
					cwd: args[0],
				},
			};

		case "name":
			if (args.length === 0) {
				return {
					kind: "run",
					effect: () => ctx.showToast("Usage: /name <text>"),
				};
			}
			return {
				kind: "ipc",
				method: "session.rename",
				args: { piSessionId: ctx.piSessionId, label: args.join(" ") },
			};

		case "compact": {
			const prompt = args.length > 0 ? args.join(" ") : undefined;
			return {
				kind: "ipc",
				method: "session.compact",
				args: { piSessionId: ctx.piSessionId, prompt },
			};
		}

		case "reload":
			return {
				kind: "ipc",
				method: "session.reload",
				args: { piSessionId: ctx.piSessionId },
			};

		default:
			return null;
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-dispatch.test.ts
```

Expected: PASS — 10 cases green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/slash/dispatch.ts tests/unit/slash-dispatch.test.ts
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/slash/dispatch.ts tests/unit/slash-dispatch.test.ts
git commit -m "feat(slash): dispatch — SlashCommand → SlashAction with streaming gate"
```

---

### Task 8: Add `session.compact` IPC type

**Files:**
- Modify: `src/shared/ipc-types.ts`

- [ ] **Step 1: Add the method type**

Read `src/shared/ipc-types.ts` to find the existing `session.*` block (around the existing `session.reload`). Add a new entry adjacent to it:

```ts
"session.compact": {
	req: { piSessionId: string; prompt?: string };
	res: Record<string, never>;
};
```

(The existing file uses `Record<string, never>` or `{}` for empty-payload responses — copy whichever pattern is in use.)

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-types.ts
git commit -m "feat(ipc): session.compact method type"
```

---

### Task 9: Wire `session.compact` IPC handler + PiSessionManager.compact

**Files:**
- Modify: `src/main/pi-session-manager.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Add `compact` method to PiSessionManager**

Read `src/main/pi-session-manager.ts` to find an existing method (e.g.  `reloadSession`) for the pattern. Add adjacent:

```ts
async compact(piSessionId: string, prompt?: string): Promise<void> {
	const agentSession = this.getAgentSession(piSessionId);
	if (!agentSession) {
		throw new Error(`No active session for ${piSessionId}`);
	}
	// pi SDK exports `compact` — use the agentSession's bound method if
	// one exists, else import the free function. Check the SDK shape:
	// `agentSession.compact(prompt?)` is the documented surface.
	await agentSession.compact(prompt);
}
```

Note: if the SDK's `agentSession` doesn't expose `compact`, import the
free `compact` function from `@earendil-works/pi-coding-agent` (the
package's top-level `index.d.ts` exports it) and call it with the
agentSession as first arg per its signature. Read the SDK's type
declarations to confirm before implementing.

- [ ] **Step 2: Register the IPC handler**

In `src/main/ipc-router.ts`, find the `session.reload` registration (around line 208) and add adjacent:

```ts
this.register("session.compact", async (args) => {
	try {
		await this.deps.piSessionManager.compact(args.piSessionId, args.prompt);
		return ok({});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		this.deps.mainLogger.warn(`session.compact failed: ${msg}`);
		return err("compact_failed", msg);
	}
});
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: clean. If the typecheck fails with "missing required field on PiSessionManager mock", proceed to step 4.

- [ ] **Step 4: Extend integration test stub (if needed)**

If `tests/integration/ipc-router.test.ts` uses a typed mock that now requires `compact`, add `compact: vi.fn().mockResolvedValue(undefined),` to the mock object. (Pattern: same as the Task 4 fix in the file-browser plan — minimal stub wiring only.)

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: typecheck clean; full suite passing (400 baseline + 8 parse + 7 expand + 7 registry + 3 templates + 10 dispatch = 435).

- [ ] **Step 6: Commit**

```bash
git add src/main/pi-session-manager.ts src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(main): session.compact wraps pi SDK compact()"
```

---

## Phase D — Toast primitive

### Task 10: ToastHost + useToast

**Files:**
- Create: `src/renderer/hooks/use-toast.ts`
- Create: `src/renderer/components/ToastHost.tsx`
- Create: `tests/unit/use-toast.test.tsx`
- Modify: `src/renderer/components/App.tsx` (mount `<ToastHost />` once at root)

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastHost } from "../../src/renderer/components/ToastHost";
import { useToast } from "../../src/renderer/hooks/use-toast";

function Caller() {
	const { showToast } = useToast();
	return (
		<button type="button" onClick={() => showToast("hello")}>
			fire
		</button>
	);
}

describe("ToastHost + useToast", () => {
	it("shows the toast after showToast() is called", async () => {
		render(
			<>
				<ToastHost />
				<Caller />
			</>,
		);
		expect(screen.queryByText("hello")).toBeNull();
		await act(async () => {
			screen.getByRole("button", { name: "fire" }).click();
		});
		expect(screen.getByText("hello")).toBeInTheDocument();
	});

	it("auto-dismisses after 3 seconds", async () => {
		vi.useFakeTimers();
		render(
			<>
				<ToastHost />
				<Caller />
			</>,
		);
		await act(async () => {
			screen.getByRole("button", { name: "fire" }).click();
		});
		expect(screen.getByText("hello")).toBeInTheDocument();
		await act(async () => {
			vi.advanceTimersByTime(3000);
		});
		expect(screen.queryByText("hello")).toBeNull();
		vi.useRealTimers();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/use-toast.test.tsx
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `src/renderer/hooks/use-toast.ts`**

```ts
// Tiny global toast registry. Single in-flight toast; new toasts replace
// the previous one. Auto-dismiss after 3 seconds. Backed by a module-
// level subscription set so any component can call useToast() without
// prop-drilling a provider.

import React from "react";

interface ToastState {
	message: string | null;
	id: number;
}

type Listener = (state: ToastState) => void;

const listeners = new Set<Listener>();
let current: ToastState = { message: null, id: 0 };
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function publish(state: ToastState) {
	current = state;
	for (const l of listeners) l(state);
}

export function showToast(message: string) {
	if (dismissTimer) clearTimeout(dismissTimer);
	publish({ message, id: current.id + 1 });
	dismissTimer = setTimeout(() => {
		publish({ message: null, id: current.id + 1 });
		dismissTimer = null;
	}, 3000);
}

export function dismissToast() {
	if (dismissTimer) {
		clearTimeout(dismissTimer);
		dismissTimer = null;
	}
	publish({ message: null, id: current.id + 1 });
}

export function useToast() {
	const [state, setState] = React.useState<ToastState>(current);
	React.useEffect(() => {
		const l: Listener = (s) => setState(s);
		listeners.add(l);
		return () => {
			listeners.delete(l);
		};
	}, []);
	return { toast: state, showToast, dismissToast };
}
```

- [ ] **Step 4: Implement `src/renderer/components/ToastHost.tsx`**

```tsx
// Renders the current toast at the bottom-center of the viewport.
// Mounted once at the app root. Click-to-dismiss.

import { dismissToast, useToast } from "../hooks/use-toast";

export function ToastHost() {
	const { toast } = useToast();
	if (!toast.message) return null;
	return (
		<button
			type="button"
			onClick={dismissToast}
			className="-translate-x-1/2 fixed bottom-6 left-1/2 z-50 rounded bg-black/80 px-4 py-2 text-sm text-white shadow-lg"
			aria-live="polite"
		>
			{toast.message}
		</button>
	);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/unit/use-toast.test.tsx
```

Expected: PASS — 2 cases green.

- [ ] **Step 6: Mount `<ToastHost />` in `App.tsx`**

Read `src/renderer/components/App.tsx` to find its root JSX. Add:

```tsx
import { ToastHost } from "./ToastHost";
```

…and inside the top-level return, add `<ToastHost />` as a sibling of the existing layout (it self-positions via `fixed`):

```tsx
return (
	<>
		{/* existing layout */}
		<ToastHost />
	</>
);
```

- [ ] **Step 7: Typecheck + lint + full suite**

```bash
npm run typecheck && npx biome check src/renderer/hooks/use-toast.ts src/renderer/components/ToastHost.tsx tests/unit/use-toast.test.tsx src/renderer/components/App.tsx && npm test
```

Expected: clean; full suite passing (~436).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/hooks/use-toast.ts src/renderer/components/ToastHost.tsx tests/unit/use-toast.test.tsx src/renderer/components/App.tsx
git commit -m "feat(toast): minimal ToastHost + useToast with 3s auto-dismiss"
```

---

## Phase E — Popup + Help dialog

### Task 11: SlashPopup component

**Files:**
- Create: `src/renderer/components/SlashPopup.tsx`
- Create: `tests/unit/slash-popup.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { SlashPopup } from "../../src/renderer/components/SlashPopup";
import type { SlashCommand } from "../../src/renderer/slash/types";

const cmds: SlashCommand[] = [
	{ name: "compact", description: "Compact context", argumentHint: "[prompt]", kind: "builtin", availableDuringStream: false },
	{ name: "copy", description: "Copy last assistant", kind: "builtin", availableDuringStream: true },
];

describe("SlashPopup", () => {
	it("renders each match's name, hint, and description", () => {
		render(
			<SlashPopup open matches={cmds} highlight={0} onHighlight={() => {}} onPick={() => {}} />,
		);
		expect(screen.getByText("/compact")).toBeInTheDocument();
		expect(screen.getByText("[prompt]")).toBeInTheDocument();
		expect(screen.getByText("Compact context")).toBeInTheDocument();
		expect(screen.getByText("/copy")).toBeInTheDocument();
	});

	it("renders 'No matches' when matches is empty", () => {
		render(
			<SlashPopup open matches={[]} highlight={0} onHighlight={() => {}} onPick={() => {}} />,
		);
		expect(screen.getByText("No matches")).toBeInTheDocument();
	});

	it("renders nothing when open is false", () => {
		const { container } = render(
			<SlashPopup open={false} matches={cmds} highlight={0} onHighlight={() => {}} onPick={() => {}} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("calls onPick when a row is clicked", () => {
		const onPick = vi.fn();
		render(
			<SlashPopup open matches={cmds} highlight={0} onHighlight={() => {}} onPick={onPick} />,
		);
		fireEvent.click(screen.getByText("/copy"));
		expect(onPick).toHaveBeenCalledWith(cmds[1]);
	});

	it("applies the highlight class to the row at the highlight index", () => {
		render(
			<SlashPopup open matches={cmds} highlight={1} onHighlight={() => {}} onPick={() => {}} />,
		);
		const rows = screen.getAllByRole("option");
		expect(rows[1].className).toContain("bg-indigo-500/20");
		expect(rows[0].className).not.toContain("bg-indigo-500/20");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/slash-popup.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/renderer/components/SlashPopup.tsx`**

```tsx
// Anchored popup rendered above the Composer textarea. Pure presentational:
// the parent owns the highlight index and pick callback. Renders "No
// matches" as a single non-interactive row so the popup is always visible
// when open, giving the user feedback for typos.

import type { SlashCommand } from "../slash/types";

interface SlashPopupProps {
	open: boolean;
	matches: SlashCommand[];
	highlight: number;
	onHighlight: (index: number) => void;
	onPick: (cmd: SlashCommand) => void;
}

export function SlashPopup({
	open,
	matches,
	highlight,
	onHighlight,
	onPick,
}: SlashPopupProps) {
	if (!open) return null;
	if (matches.length === 0) {
		return (
			<div
				role="listbox"
				aria-label="Slash commands"
				className="max-h-60 overflow-auto rounded border border-white/10 bg-black/80 p-2 text-xs text-muted"
			>
				No matches
			</div>
		);
	}
	return (
		<div
			role="listbox"
			aria-label="Slash commands"
			className="max-h-60 overflow-auto rounded border border-white/10 bg-black/80"
		>
			{matches.map((cmd, i) => {
				const isActive = i === highlight;
				return (
					<button
						key={`${cmd.kind}:${cmd.name}`}
						type="button"
						role="option"
						aria-selected={isActive}
						onMouseEnter={() => onHighlight(i)}
						onClick={() => onPick(cmd)}
						className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-xs ${
							isActive ? "bg-indigo-500/20" : "hover:bg-white/5"
						}`}
					>
						<span className="font-semibold">/{cmd.name}</span>
						{cmd.argumentHint && (
							<span className="text-muted">{cmd.argumentHint}</span>
						)}
						<span className="ml-auto truncate text-muted">
							{cmd.description}
						</span>
					</button>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/slash-popup.test.tsx
```

Expected: PASS — 5 cases green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/components/SlashPopup.tsx tests/unit/slash-popup.test.tsx
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SlashPopup.tsx tests/unit/slash-popup.test.tsx
git commit -m "feat(ui): SlashPopup — listbox with highlight + click/hover"
```

---

### Task 12: HelpDialog component

**Files:**
- Create: `src/renderer/components/HelpDialog.tsx`

- [ ] **Step 1: Implement (no separate test — exercised by manual smoke)**

```tsx
// Modal listing all available slash commands grouped by category. Opened
// by /help. Closes on Esc, on backdrop click, or via the close button.

import React from "react";
import type { SlashCommand } from "../slash/types";

interface HelpDialogProps {
	open: boolean;
	onClose: () => void;
	commands: SlashCommand[];
}

const GROUP_LABEL: Record<SlashCommand["kind"], string> = {
	builtin: "Built-in",
	template: "Prompt Templates",
	skill: "Skills",
};

export function HelpDialog({ open, onClose, commands }: HelpDialogProps) {
	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const groups: Record<SlashCommand["kind"], SlashCommand[]> = {
		builtin: [],
		template: [],
		skill: [],
	};
	for (const c of commands) groups[c.kind].push(c);
	for (const k of Object.keys(groups) as SlashCommand["kind"][]) {
		groups[k].sort((a, b) => a.name.localeCompare(b.name));
	}

	return (
		<div
			className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
		>
			<div
				className="max-h-[80vh] w-[640px] max-w-[90vw] overflow-auto rounded border border-white/10 bg-black/90 p-4 text-sm text-primary"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center">
					<h2 className="font-semibold">Slash Commands</h2>
					<button
						type="button"
						onClick={onClose}
						className="ml-auto rounded px-2 py-1 hover:bg-white/5"
						aria-label="Close"
					>
						✕
					</button>
				</div>
				{(Object.keys(groups) as SlashCommand["kind"][]).map((kind) =>
					groups[kind].length > 0 ? (
						<section key={kind} className="mt-3">
							<h3 className="mb-1 text-xs text-muted">{GROUP_LABEL[kind]}</h3>
							<ul className="space-y-0.5">
								{groups[kind].map((c) => (
									<li
										key={`${c.kind}:${c.name}`}
										className="flex items-baseline gap-2 px-1 py-0.5"
									>
										<span className="font-semibold">/{c.name}</span>
										{c.argumentHint && (
											<span className="text-muted">{c.argumentHint}</span>
										)}
										<span className="ml-auto truncate text-muted">
											{c.description}
										</span>
									</li>
								))}
							</ul>
						</section>
					) : null,
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/components/HelpDialog.tsx
```

Expected: clean. The `onClick` on the outer div is intentionally a backdrop-close handler — if biome flags the missing keyboard handler on a non-button element, add a `role="presentation"` to the outer div (Esc handling already covers keyboard).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/HelpDialog.tsx
git commit -m "feat(ui): HelpDialog — grouped command list with Esc/backdrop close"
```

---

## Phase F — Composer + ChatPane integration

### Task 13: Composer wiring — trigger detection, popup, dispatcher loop

**Files:**
- Modify: `src/renderer/components/Composer.tsx`

- [ ] **Step 1: Extend `ComposerProps` and accept the dispatch context inputs**

Replace the existing `ComposerProps` interface in `src/renderer/components/Composer.tsx` with:

```ts
export interface ComposerProps {
	streaming: boolean;
	onSend: (text: string, intent: SendIntent) => Promise<void>;
	messageHistory?: readonly string[];
	// Slash-command wiring (new):
	piSessionId: string | null;
	channelId: string | null;
	lastAssistantText: () => string | null;
	openHelpDialog: () => void;
	onSessionCreated: (newPiSessionId: string) => void;
}
```

- [ ] **Step 2: Add slash state + memoised matches inside the component**

After the existing `useState` calls in `Composer({...})`, add:

```tsx
const [slashOpen, setSlashOpen] = React.useState(false);
const [slashHighlight, setSlashHighlight] = React.useState(0);
const prompts = usePrompts();
const skills = useSkills();
const { showToast } = useToast();

const allCommands = React.useMemo(
	() => [
		...builtinCommands(),
		...templateCommands(prompts.data?.prompts ?? []),
		...skillCommands(skills.data?.skills ?? []),
	],
	[prompts.data, skills.data],
);

const parsedQuery = React.useMemo(() => parse(input), [input]);
const matches = React.useMemo(
	() => (parsedQuery ? match(parsedQuery.name, allCommands) : []),
	[parsedQuery, allCommands],
);

// Open the popup whenever the input parses as a slash trigger.
React.useEffect(() => {
	const shouldOpen = parsedQuery !== null;
	setSlashOpen(shouldOpen);
	if (!shouldOpen) setSlashHighlight(0);
}, [parsedQuery]);

// Clamp highlight if matches shrinks below current index.
React.useEffect(() => {
	if (slashHighlight >= matches.length) setSlashHighlight(0);
}, [matches.length, slashHighlight]);
```

Imports to add at the top of the file:

```ts
import { usePrompts, useSkills } from "../queries";
import { useToast } from "../hooks/use-toast";
import { parse } from "../slash/parse";
import { builtinCommands, match } from "../slash/registry";
import { templateCommands, dispatchTemplate } from "../slash/templates";
import { skillCommands } from "../slash/skills";
import { dispatch } from "../slash/dispatch";
import type { SlashCommand, SlashDispatchCtx } from "../slash/types";
import { SlashPopup } from "./SlashPopup";
import { invoke } from "../ipc";
```

(If `useSkills` isn't exported from `queries.ts`, read it first and add a one-liner export. The check for it: `grep -n "useSkills" src/renderer/queries.ts`.)

- [ ] **Step 3: Build the dispatch context + dispatcher loop**

Inside `Composer`, add a `runSlash` function that:

```tsx
const ctx: SlashDispatchCtx = React.useMemo(
	() => ({
		streaming,
		piSessionId: piSessionId ?? "",
		channelId,
		lastAssistantText,
		openHelpDialog,
		showToast,
		clearComposerInput: clearInput,
		onSessionCreated,
	}),
	[
		streaming,
		piSessionId,
		channelId,
		lastAssistantText,
		openHelpDialog,
		showToast,
		onSessionCreated,
	],
);

async function runSlash(cmd: SlashCommand) {
	if (!parsedQuery || !piSessionId) return;

	// Templates go through dispatchTemplate (async, fetches body).
	if (cmd.kind === "template") {
		const summary = prompts.data?.prompts.find((p) => p.name === cmd.name);
		if (!summary) {
			showToast("Template not found");
			return;
		}
		try {
			const action = await dispatchTemplate(summary, parsedQuery.args, invoke);
			if (action.kind === "replace") {
				setInput(action.text);
				setSlashOpen(false);
			} else if (action.kind === "run") {
				try {
					await action.effect();
				} catch (e) {
					showToast(e instanceof Error ? e.message : String(e));
				}
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : String(e));
		}
		return;
	}

	const action = dispatch(cmd, parsedQuery, ctx);
	if (action === null) {
		// Skill: leave input intact, close popup, user can hit Enter to send.
		setSlashOpen(false);
		return;
	}
	switch (action.kind) {
		case "block":
			showToast(action.reason);
			return;
		case "run":
			try {
				await action.effect();
			} catch (e) {
				showToast(e instanceof Error ? e.message : String(e));
			}
			clearInput();
			setSlashOpen(false);
			return;
		case "ipc":
			try {
				const res = await invoke(action.method as never, action.args as never);
				if (action.method === "session.create" && res && typeof res === "object" && "piSessionId" in res) {
					onSessionCreated((res as { piSessionId: string }).piSessionId);
				}
			} catch (e) {
				showToast(e instanceof Error ? e.message : String(e));
			}
			clearInput();
			setSlashOpen(false);
			return;
		case "replace":
			setInput(action.text);
			setSlashOpen(false);
			return;
		case "send":
			await onSend(action.text, defaultIntent());
			clearInput();
			setSlashOpen(false);
			return;
	}
}
```

- [ ] **Step 4: Intercept keyboard events when slash is open**

Modify `onInputKeyDown` so when `slashOpen` is true, the popup keys win:

```tsx
function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
	if (slashOpen) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSlashHighlight((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length));
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			setSlashHighlight((i) =>
				matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
			);
			return;
		}
		if (e.key === "Enter" && !e.shiftKey) {
			if (matches.length > 0) {
				e.preventDefault();
				void runSlash(matches[slashHighlight]);
				return;
			}
			// No matches → no-op (don't send literal "/foo" as a message).
			e.preventDefault();
			return;
		}
		if (e.key === "Tab") {
			if (matches.length > 0) {
				e.preventDefault();
				const cmd = matches[slashHighlight];
				setInput(`/${cmd.name} `);
				return;
			}
		}
		if (e.key === "Escape") {
			e.preventDefault();
			setSlashOpen(false);
			return;
		}
	}

	const action = resolveComposerKeyAction({ key: e.key, shiftKey: e.shiftKey });
	if (action === "clear") {
		e.preventDefault();
		clearInput();
		return;
	}
	if (action === "submit") {
		e.preventDefault();
		void submit(defaultIntent());
		return;
	}

	if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
	const result = navigateComposerHistory({
		key: e.key,
		input,
		history: messageHistory,
		activeIndex: historyIndex,
	});
	if (!result.handled) {
		if (result.activeIndex !== historyIndex) setHistoryIndex(result.activeIndex);
		return;
	}
	e.preventDefault();
	setInput(result.input);
	setHistoryIndex(result.activeIndex);
}
```

- [ ] **Step 5: Render `<SlashPopup>` above the form**

Wrap the existing `<form>` return in a flex column with the popup as a sibling positioned above:

```tsx
return (
	<div className="flex flex-col gap-1">
		<SlashPopup
			open={slashOpen}
			matches={matches}
			highlight={slashHighlight}
			onHighlight={setSlashHighlight}
			onPick={runSlash}
		/>
		<form onSubmit={onFormSubmit} className="flex gap-2 rounded surface-app p-2">
			{/* existing textarea + buttons unchanged */}
		</form>
	</div>
);
```

- [ ] **Step 6: Typecheck + lint + tests**

```bash
npm run typecheck && npx biome check src/renderer/components/Composer.tsx && npm test
```

Expected: clean, all tests pass (no Composer unit tests in repo today; integration via ChatPane).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Composer.tsx
git commit -m "feat(composer): slash-command trigger, popup, dispatcher loop"
```

---

### Task 14: ChatPane wiring — pass new props, mount HelpDialog

**Files:**
- Modify: `src/renderer/components/ChatPane.tsx`

- [ ] **Step 1: Add help-dialog state + helper closures**

Inside `ChatPane({...})`, after the existing hooks block, add:

```tsx
const [helpOpen, setHelpOpen] = React.useState(false);
const lastAssistantText = React.useCallback(() => {
	const ts = snapshot.timeline;
	for (let i = ts.length - 1; i >= 0; i--) {
		const entry = ts[i];
		if (entry.kind === "assistant-text") return entry.text;
	}
	return null;
}, [snapshot.timeline]);

// All slash commands list, for HelpDialog. Built fresh on each render —
// cheap (~10 builtins + a dozen prompts + a few skills).
const prompts = usePrompts();
const skills = useSkills();
const allSlashCommands = React.useMemo(
	() => [
		...builtinCommands(),
		...templateCommands(prompts.data?.prompts ?? []),
		...skillCommands(skills.data?.skills ?? []),
	],
	[prompts.data, skills.data],
);
```

Imports to add at the top:

```ts
import { HelpDialog } from "./HelpDialog";
import { builtinCommands } from "../slash/registry";
import { skillCommands } from "../slash/skills";
import { templateCommands } from "../slash/templates";
import { usePrompts, useSkills } from "../queries";
```

- [ ] **Step 2: Pass new props to `<Composer>`**

Find the `<Composer>` instantiation in the returned JSX (look for `streaming={...} onSend={send}`). Extend:

```tsx
<Composer
	streaming={snapshot.streaming}
	onSend={send}
	messageHistory={messageHistory}
	piSessionId={piSessionId}
	channelId={sessionChannel.data?.channelId ?? null}
	lastAssistantText={lastAssistantText}
	openHelpDialog={() => setHelpOpen(true)}
	onSessionCreated={onSelectSession}
/>
```

- [ ] **Step 3: Mount `<HelpDialog>` somewhere stable in the return tree**

Add `<HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} commands={allSlashCommands} />` as a sibling of the main column (e.g. just before the closing tag of the outermost wrapper).

- [ ] **Step 4: Typecheck + lint + full suite**

```bash
npm run typecheck && npx biome check src/renderer/components/ChatPane.tsx && npm test
```

Expected: clean; full suite passing.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run `npm start`, open the chat, type `/`. Verify:
- Popup appears with 7 built-ins + N prompts + N skills.
- `↓` / `↑` move the highlight.
- Enter on `/help` opens the dialog; Esc closes it.
- `/copy` (after some assistant output exists) writes to clipboard; toast appears.
- `/compact` during streaming → toast "Wait for the agent to finish".
- `/compact` while idle → triggers compaction.
- Slash-mid-prose (`How does /etc work?`) does not open the popup.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ChatPane.tsx
git commit -m "feat(chat): wire slash-command context + HelpDialog into ChatPane"
```

---

## Phase G — Documentation

### Task 15: Update spec status + smoke note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-slash-commands-design.md`

- [ ] **Step 1: Bump status from approved → shipped**

Replace:

```markdown
**Status:** approved
```

with:

```markdown
**Status:** shipped
```

- [ ] **Step 2: Append implementation note**

Append at the bottom of the spec:

```markdown
## 9. Implementation

Implemented per `docs/superpowers/plans/2026-05-17-macpi-slash-commands.md`.

Spec adjustments during implementation:
- Body fetch reused the existing `prompts.read` IPC (returns
  `{manifest, body}`) instead of adding a new `prompts.readBody`.

Manual smoke per §6 deferred to user testing on macOS — automated
tests cover parse, expand, registry, dispatch, templates adapter,
popup, and the toast primitive (33 new tests).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-slash-commands-design.md
git commit -m "docs: mark slash-commands spec as shipped"
```

---

## Wrap-up

After all 15 tasks complete:

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, biome clean, **~441 tests passing** (400 baseline + 8 parse + 7 expand + 7 registry + 3 templates + 10 dispatch + 5 popup + 2 toast — exact count may shift by ±2 if assertions are split).

```bash
git log --oneline slash-commands ^main
```

Expected: 15+ commits on top of the spec commit (`f9e07c4`).

Ready to merge `slash-commands` into `main`.
