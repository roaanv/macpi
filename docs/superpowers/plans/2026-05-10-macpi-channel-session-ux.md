# Channel / Session UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the channel/session sidebar a daily-driver: rename + delete for channels and sessions, real cwd picker, human-readable session labels (auto-derived + user-editable), single-line breadcrumb in the chat header, and auto-focus on creation.

**Architecture:** No new layers. New DB columns on `channel_sessions` (`label`, `label_user_set`). 6 new IPC methods (`session.rename`, `session.delete`, `session.setFirstMessageLabel`, `session.getMeta`, `dialog.openFolder`, `settings.getDefaultCwd`) + extended `channels.delete` with `force` semantics. Renderer adds `RowMenu`, `ConfirmDialog`, `NewSessionForm`, `BreadcrumbBar` and wires hover-revealed `⋮` menus into `ChannelSidebar`.

**Tech Stack:** Electron 42, TypeScript, React 18, TanStack Query 5, Tailwind v3, Vitest 3, Biome v2, `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-05-10-channel-session-ux-polish-design.md`.

---

## Pre-flight

Before starting, **create an isolated worktree** via the `superpowers:using-git-worktrees` skill (preferred: native worktree tool, fallback: `git worktree add`). Branch off `main` (HEAD currently `2125fbf` — spec doc commit, on top of `b8a65d9` queue-item-cancel).

After worktree creation, run:

```bash
npm install
npm run typecheck && npm run lint && npm run test
```

Expected baseline: typecheck clean, biome clean, **67/67 tests passing**.

**Heads-up to implementers:** the in-editor LSP shows false positives (JSX intrinsic elements unknown, `Cannot find module '@earendil-works/...'`, etc). **`npm run typecheck` is the ground truth** — ignore IDE-LSP noise. The project uses `tsconfig.json` with `jsx: "react-jsx"`, `moduleResolution: "Bundler"`, `target: "ES2022"`.

---

## File Structure

```
src/main/
  db/migrations/0003-session_labels.sql                  [NEW]
  repos/channels.ts                                      [MODIFY: +countSessions]
  repos/channel-sessions.ts                              [MODIFY: +setLabel, +setFirstMessageLabel, +delete, label fields in getMeta]
  ipc-router.ts                                          [MODIFY: +6 methods, extend channels.delete]
  dialog-handlers.ts                                     [NEW]
  default-cwd.ts                                         [NEW]
  index.ts                                               [MODIFY: wire dialog handlers]
  pi-session-manager.ts                                  [MODIFY: +disposeSession]

src/shared/
  ipc-types.ts                                           [MODIFY: +6 method types, extend channels.delete]

src/renderer/
  components/ChannelSidebar.tsx                          [MODIFY: hover menus, NewSessionForm, auto-focus, delete handling]
  components/NewSessionForm.tsx                          [NEW]
  components/RowMenu.tsx                                 [NEW]
  components/ConfirmDialog.tsx                           [NEW]
  components/BreadcrumbBar.tsx                           [NEW]
  components/ChatPane.tsx                                [MODIFY: breadcrumb]
  state/timeline-state.ts                                [MODIFY: appendUserMessage triggers first-message label]
  queries.ts                                             [MODIFY: +9 hooks]
  util/label.ts                                          [NEW]

tests/
  unit/label.test.ts                                     [NEW]
  unit/migrations.test.ts                                [MODIFY: bump version 2 → 3, add label-columns assertion]
  integration/channels-repo.test.ts                      [MODIFY: +rename/delete/cascade/label cases]
  integration/ipc-router.test.ts                         [MODIFY: +~12 new test cases]
```

Each task below includes the failing-test → impl → passing-test → commit cycle. Test files are extended in place.

---

## Phase A — DB foundation

### Task 1: Migration 0003 — session_labels

**Files:**
- Create: `src/main/db/migrations/0003-session_labels.sql`
- Modify: `tests/unit/migrations.test.ts`

- [ ] **Step 1: Write the failing migration test**

Edit `tests/unit/migrations.test.ts`. Update the version expectations and add a label-columns assertion.

```ts
	it("starts at version 0 and applies 0001", () => {
		expect(currentVersion(db)).toBe(0);
		runMigrations(db);
		expect(currentVersion(db)).toBe(3);
	});

	it("is idempotent on re-run", () => {
		runMigrations(db);
		runMigrations(db);
		expect(currentVersion(db)).toBe(3);
	});
```

Append a new test before the closing `});`:

```ts
	it("003 adds label and label_user_set columns to channel_sessions", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = (
			memDb.raw
				.prepare("PRAGMA table_info(channel_sessions)")
				.all() as unknown as Array<{ name: string; dflt_value: unknown }>
		);
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("label");
		expect(colNames).toContain("label_user_set");
		const flag = cols.find((c) => c.name === "label_user_set");
		expect(flag?.dflt_value).toBe("0");
		memDb.close();
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/unit/migrations.test.ts
```

Expected: `expect(currentVersion(db)).toBe(3)` fails (got 2). The new label-columns test fails because columns don't exist.

- [ ] **Step 3: Create the migration**

Create `src/main/db/migrations/0003-session_labels.sql`:

```sql
ALTER TABLE channel_sessions ADD COLUMN label TEXT;
ALTER TABLE channel_sessions ADD COLUMN label_user_set INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/unit/migrations.test.ts
```

Expected: PASS (6/6 in the file).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/0003-session_labels.sql tests/unit/migrations.test.ts
git commit -m "feat(db): add label + label_user_set columns to channel_sessions"
```

---

### Task 2: ChannelSessionsRepo — label methods

**Files:**
- Modify: `src/main/repos/channel-sessions.ts`
- Modify: `tests/integration/channels-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/channels-repo.test.ts` inside the `describe("ChannelSessionsRepo", ...)` block:

```ts
	it("setLabel stores a user-set label and flags label_user_set=1", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: "/tmp/work",
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "my session");
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBe("my session");
		expect(meta?.labelUserSet).toBe(true);
	});

	it("setLabel with empty string clears the label and unsets the flag", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "named");
		sessionsRepo.setLabel("pi-1", "");
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBeNull();
		expect(meta?.labelUserSet).toBe(false);
	});

	it("setFirstMessageLabel writes when label_user_set=0", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: "/Users/x/mycode/macpi",
			sessionFilePath: null,
		});
		const applied = sessionsRepo.setFirstMessageLabel(
			"pi-1",
			"macpi: fix the build",
		);
		expect(applied).toBe(true);
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBe("macpi: fix the build");
		expect(meta?.labelUserSet).toBe(false);
	});

	it("setFirstMessageLabel is a no-op when label_user_set=1", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "user named me");
		const applied = sessionsRepo.setFirstMessageLabel("pi-1", "should be ignored");
		expect(applied).toBe(false);
		expect(sessionsRepo.getMeta("pi-1")?.label).toBe("user named me");
	});

	it("delete removes a single channel_sessions row", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-2",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.delete("pi-1");
		expect(sessionsRepo.listByChannel(channelId)).toEqual(["pi-2"]);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/channels-repo.test.ts
```

Expected: `setLabel`, `setFirstMessageLabel`, `delete` are not functions on `sessionsRepo`.

- [ ] **Step 3: Implement repo methods**

Modify `src/main/repos/channel-sessions.ts`. Update `SessionMeta` and add the three methods, plus widen the `getMeta` query to read the new columns.

```ts
export interface SessionMeta {
	piSessionId: string;
	cwd: string | null;
	sessionFilePath: string | null;
	label: string | null;
	labelUserSet: boolean;
}
```

Replace the existing `getMeta` body with:

```ts
	getMeta(piSessionId: string): SessionMeta | null {
		const row = this.db.raw
			.prepare(
				"SELECT pi_session_id AS piSessionId, cwd, session_file_path AS sessionFilePath, label, label_user_set AS labelUserSet FROM channel_sessions WHERE pi_session_id = ?",
			)
			.get(piSessionId) as unknown as
			| {
					piSessionId: string;
					cwd: string | null;
					sessionFilePath: string | null;
					label: string | null;
					labelUserSet: number;
			  }
			| undefined;
		if (!row) return null;
		return {
			piSessionId: row.piSessionId,
			cwd: row.cwd,
			sessionFilePath: row.sessionFilePath,
			label: row.label,
			labelUserSet: row.labelUserSet === 1,
		};
	}
```

Append three new methods inside the class (before `nextPosition`):

```ts
	/**
	 * User-set label. Empty string clears the label and the user-set flag,
	 * letting auto-labeling kick in again on the next first-message hook.
	 */
	setLabel(piSessionId: string, label: string): void {
		if (label === "") {
			this.db.raw
				.prepare(
					"UPDATE channel_sessions SET label = NULL, label_user_set = 0 WHERE pi_session_id = ?",
				)
				.run(piSessionId);
			return;
		}
		this.db.raw
			.prepare(
				"UPDATE channel_sessions SET label = ?, label_user_set = 1 WHERE pi_session_id = ?",
			)
			.run(label, piSessionId);
	}

	/**
	 * Auto-label hook: writes label only if label_user_set = 0. Returns true
	 * if a write happened.
	 */
	setFirstMessageLabel(piSessionId: string, label: string): boolean {
		const info = this.db.raw
			.prepare(
				"UPDATE channel_sessions SET label = ? WHERE pi_session_id = ? AND label_user_set = 0",
			)
			.run(label, piSessionId) as unknown as { changes: number };
		return info.changes > 0;
	}

	delete(piSessionId: string): void {
		this.db.raw
			.prepare("DELETE FROM channel_sessions WHERE pi_session_id = ?")
			.run(piSessionId);
	}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/integration/channels-repo.test.ts
```

Expected: PASS (all `ChannelSessionsRepo` tests including the 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/main/repos/channel-sessions.ts tests/integration/channels-repo.test.ts
git commit -m "feat(repo): add setLabel/setFirstMessageLabel/delete to ChannelSessionsRepo"
```

---

### Task 3: ChannelsRepo — countSessions

**Files:**
- Modify: `src/main/repos/channels.ts`
- Modify: `tests/integration/channels-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the `describe("ChannelsRepo", ...)` block in `tests/integration/channels-repo.test.ts`:

```ts
	it("countSessions returns 0 for an empty channel", () => {
		const c = repo.create({ name: "empty" });
		expect(repo.countSessions(c.id)).toBe(0);
	});

	it("countSessions returns the number of attached sessions", () => {
		const c = repo.create({ name: "busy" });
		const sr = new ChannelSessionsRepo(db);
		sr.attach({
			channelId: c.id,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		sr.attach({
			channelId: c.id,
			piSessionId: "s2",
			cwd: null,
			sessionFilePath: null,
		});
		expect(repo.countSessions(c.id)).toBe(2);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/channels-repo.test.ts
```

Expected: `countSessions` is not a function on `repo`.

- [ ] **Step 3: Implement countSessions**

Add to `src/main/repos/channels.ts` inside the class (before `private nextPosition`):

```ts
	countSessions(channelId: string): number {
		const row = this.db.raw
			.prepare(
				"SELECT COUNT(*) AS n FROM channel_sessions WHERE channel_id = ?",
			)
			.get(channelId) as unknown as { n: number };
		return row.n;
	}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/integration/channels-repo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/repos/channels.ts tests/integration/channels-repo.test.ts
git commit -m "feat(repo): add ChannelsRepo.countSessions"
```

---

## Phase B — Main process IPC

### Task 4: Extend IpcMethods registry

**Files:**
- Modify: `src/shared/ipc-types.ts`

- [ ] **Step 1: Add IPC type entries**

Edit `src/shared/ipc-types.ts`. Replace the existing `"channels.delete"` entry and append the 6 new methods. Place new entries grouped logically in the `IpcMethods` interface:

```ts
	"channels.delete": {
		req: { id: string; force?: boolean };
		res: Record<string, never>;
	};
```

Append (after `"session.listForChannel"`):

```ts
	"session.rename": {
		req: { piSessionId: string; label: string };
		res: Record<string, never>;
	};
	"session.delete": {
		req: { piSessionId: string };
		res: Record<string, never>;
	};
	"session.setFirstMessageLabel": {
		req: { piSessionId: string; text: string };
		/** applied=true when the auto-label was written; false when the user has already set a label. */
		res: { applied: boolean };
	};
	"session.getMeta": {
		req: { piSessionId: string };
		res: {
			piSessionId: string;
			cwd: string | null;
			label: string | null;
		};
	};
	"dialog.openFolder": {
		req: { defaultPath?: string };
		/** path is null when the user cancelled the dialog. */
		res: { path: string | null };
	};
	"settings.getDefaultCwd": {
		req: Record<string, never>;
		res: { cwd: string };
	};
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS (handlers haven't been added yet, but the type registry alone compiles).

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-types.ts
git commit -m "feat(ipc): extend types for session rename/delete/getMeta + dialog + settings"
```

---

### Task 5: PiSessionManager.disposeSession

**Files:**
- Modify: `src/main/pi-session-manager.ts`

We need a way for `session.delete` and force-`channels.delete` to tear down the active pi session if one is loaded.

- [ ] **Step 1: Add disposeSession method**

Add this method to the `PiSessionManager` class in `src/main/pi-session-manager.ts`, placed after `shutdown()`:

```ts
	/**
	 * Tear down a single active session if loaded. No-op if not loaded.
	 * Used by session/channel deletion. Does not delete pi's session file
	 * on disk — that's preserved for recoverability.
	 */
	disposeSession(piSessionId: string): void {
		const active = this.active.get(piSessionId);
		if (!active) return;
		active.unsubscribe();
		this.active.delete(piSessionId);
	}
```

- [ ] **Step 2: Verify typecheck + existing tests**

```
npm run typecheck && npm run test
```

Expected: PASS (no behavior change for existing callers).

- [ ] **Step 3: Commit**

```bash
git add src/main/pi-session-manager.ts
git commit -m "feat(main): add PiSessionManager.disposeSession"
```

---

### Task 6: IPC — session.rename + session.delete

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/ipc-router.test.ts` inside the `describe("IpcRouter", ...)` block:

```ts
	it("session.rename writes the user-set label", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-rename",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("session.rename", {
			piSessionId: "s-rename",
			label: "my work",
		});

		expect(r).toEqual({ ok: true, data: {} });
		// Check the underlying repo
		const repo = new ChannelSessionsRepo(db);
		expect(repo.getMeta("s-rename")?.label).toBe("my work");
		expect(repo.getMeta("s-rename")?.labelUserSet).toBe(true);
	});

	it("session.delete removes the row and disposes the active pi session", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-del",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("session.delete", { piSessionId: "s-del" });

		expect(r).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s-del");
		const list = await router.dispatch("session.listForChannel", {
			channelId: c.data.id,
		});
		if (!list.ok) throw new Error("listForChannel failed");
		expect(list.data.piSessionIds).toEqual([]);
	});
```

Also extend `piSessionManagerMock` (top of the file) to include `disposeSession`:

```ts
let piSessionManagerMock: {
	createSession: ReturnType<typeof vi.fn>;
	prompt: ReturnType<typeof vi.fn>;
	clearQueue: ReturnType<typeof vi.fn>;
	removeFromQueue: ReturnType<typeof vi.fn>;
	abort: ReturnType<typeof vi.fn>;
	attachSession: ReturnType<typeof vi.fn>;
	getHistory: ReturnType<typeof vi.fn>;
	disposeSession: ReturnType<typeof vi.fn>;
};
```

And inside `beforeEach`:

```ts
	piSessionManagerMock = {
		createSession: vi.fn(),
		prompt: vi.fn(),
		clearQueue: vi.fn(),
		removeFromQueue: vi.fn(),
		abort: vi.fn(),
		attachSession: vi.fn(),
		getHistory: vi.fn(),
		disposeSession: vi.fn(),
	};
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: `unknown_method` for `session.rename` and `session.delete`.

- [ ] **Step 3: Implement handlers**

Edit `src/main/ipc-router.ts`. Inside the constructor `this.register(...)` block, append before the closing `}`:

```ts
		this.register("session.rename", async (args) => {
			this.deps.channelSessions.setLabel(args.piSessionId, args.label);
			return ok({});
		});
		this.register("session.delete", async (args) => {
			this.deps.piSessionManager.disposeSession(args.piSessionId);
			this.deps.channelSessions.delete(args.piSessionId);
			return ok({});
		});
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): session.rename + session.delete"
```

---

### Task 7: IPC — channels.delete with force

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

The existing `channels.delete` handler unconditionally deletes (relying on DB cascade). We need to add the non-empty pre-check + dispose loop.

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/ipc-router.test.ts`:

```ts
	it("channels.delete on a non-empty channel without force returns non_empty", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s1",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("channels.delete", { id: c.data.id });

		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe("non_empty");
			expect(r.error.message).toContain("1");
		}
	});

	it("channels.delete with force=true cascades and disposes pi sessions", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s1",
			sessionFilePath: null,
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s2",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("channels.delete", {
			id: c.data.id,
			force: true,
		});

		expect(r).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s1");
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s2");
		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		expect(list.data.channels).toHaveLength(0);
	});

	it("channels.delete on an empty channel succeeds without force", async () => {
		const c = await router.dispatch("channels.create", { name: "empty" });
		if (!c.ok) throw new Error("setup");

		const r = await router.dispatch("channels.delete", { id: c.data.id });

		expect(r).toEqual({ ok: true, data: {} });
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: the non_empty test fails (current handler ignores it). The dispose test fails (current handler doesn't call `disposeSession`).

- [ ] **Step 3: Update the channels.delete handler**

In `src/main/ipc-router.ts`, replace the existing `channels.delete` registration with:

```ts
		this.register("channels.delete", async (args) => {
			const sessionIds = this.deps.channelSessions.listByChannel(args.id);
			if (sessionIds.length > 0 && !args.force) {
				return err(
					"non_empty",
					`channel has ${sessionIds.length} session(s); pass force:true to cascade`,
				);
			}
			for (const id of sessionIds) {
				this.deps.piSessionManager.disposeSession(id);
			}
			this.deps.channels.delete(args.id);
			return ok({});
		});
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): channels.delete force semantics + dispose"
```

---

### Task 8: IPC — session.getMeta + session.setFirstMessageLabel

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/ipc-router.test.ts`:

```ts
	it("session.getMeta returns the persisted label and cwd", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-meta",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/Users/x/repo",
		});

		const r = await router.dispatch("session.getMeta", { piSessionId: "s-meta" });

		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.data).toEqual({
				piSessionId: "s-meta",
				cwd: "/Users/x/repo",
				label: null,
			});
		}
	});

	it("session.getMeta returns not_found for unknown session", async () => {
		const r = await router.dispatch("session.getMeta", { piSessionId: "nope" });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe("not_found");
	});

	it("session.setFirstMessageLabel writes when label_user_set=0", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fm",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/Users/x/macpi",
		});

		const r = await router.dispatch("session.setFirstMessageLabel", {
			piSessionId: "s-fm",
			text: "macpi: fix the build",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.applied).toBe(true);
		const meta = await router.dispatch("session.getMeta", {
			piSessionId: "s-fm",
		});
		if (!meta.ok) throw new Error("getMeta failed");
		expect(meta.data.label).toBe("macpi: fix the build");
	});

	it("session.setFirstMessageLabel returns applied=false when user has set a label", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fm2",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/x",
		});
		await router.dispatch("session.rename", {
			piSessionId: "s-fm2",
			label: "user named",
		});

		const r = await router.dispatch("session.setFirstMessageLabel", {
			piSessionId: "s-fm2",
			text: "ignored",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.applied).toBe(false);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: `unknown_method` for both methods.

- [ ] **Step 3: Implement the handlers**

In `src/main/ipc-router.ts`, append inside the constructor:

```ts
		this.register("session.getMeta", async (args) => {
			const meta = this.deps.channelSessions.getMeta(args.piSessionId);
			if (!meta) return err("not_found", `session ${args.piSessionId} not found`);
			return ok({
				piSessionId: meta.piSessionId,
				cwd: meta.cwd,
				label: meta.label,
			});
		});
		this.register("session.setFirstMessageLabel", async (args) => {
			const applied = this.deps.channelSessions.setFirstMessageLabel(
				args.piSessionId,
				args.text,
			);
			return ok({ applied });
		});
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): session.getMeta + session.setFirstMessageLabel"
```

---

### Task 9: IPC — dialog.openFolder + settings.getDefaultCwd

**Files:**
- Create: `src/main/dialog-handlers.ts`
- Create: `src/main/default-cwd.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/integration/ipc-router.test.ts`

We're introducing dependencies on `electron.dialog` (which is already mocked in tests) and on `os.homedir()` (pure).

- [ ] **Step 1: Write failing tests**

At the top of `tests/integration/ipc-router.test.ts`, replace the existing `vi.mock("electron", ...)` with:

```ts
const dialogShowOpenDialog = vi.fn();
vi.mock("electron", () => ({
	ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
	dialog: { showOpenDialog: dialogShowOpenDialog },
	BrowserWindow: { getFocusedWindow: () => null },
}));
```

Add a fresh-state `beforeEach` step just for the mock:

Inside the existing `beforeEach`, after `runMigrations(db);`, add:

```ts
	dialogShowOpenDialog.mockReset();
```

Append three new tests inside the `describe("IpcRouter", ...)` block:

```ts
	it("dialog.openFolder returns the selected path", async () => {
		dialogShowOpenDialog.mockResolvedValueOnce({
			canceled: false,
			filePaths: ["/Users/x/picked"],
		});
		const r = await router.dispatch("dialog.openFolder", {});
		expect(r).toEqual({ ok: true, data: { path: "/Users/x/picked" } });
	});

	it("dialog.openFolder returns null when cancelled", async () => {
		dialogShowOpenDialog.mockResolvedValueOnce({
			canceled: true,
			filePaths: [],
		});
		const r = await router.dispatch("dialog.openFolder", {});
		expect(r).toEqual({ ok: true, data: { path: null } });
	});

	it("settings.getDefaultCwd returns a non-empty path", async () => {
		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(typeof r.data.cwd).toBe("string");
			expect(r.data.cwd.length).toBeGreaterThan(0);
		}
	});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: `unknown_method` for both.

- [ ] **Step 3: Create dialog-handlers.ts**

Create `src/main/dialog-handlers.ts`:

```ts
// Wraps Electron's native dialog APIs so they're testable. Renderer
// reaches these via the IPC router; main passes our handler in via
// constructor injection so tests can mock electron's `dialog` import.

import { dialog } from "electron";

export interface DialogHandlers {
	openFolder(opts: { defaultPath?: string }): Promise<{ path: string | null }>;
}

export const electronDialogHandlers: DialogHandlers = {
	async openFolder({ defaultPath }) {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory"],
			defaultPath,
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}
		return { path: result.filePaths[0] };
	},
};
```

- [ ] **Step 4: Create default-cwd.ts**

Create `src/main/default-cwd.ts`:

```ts
// Returns the global default cwd used when the user creates a new
// session. Stub: returns the home directory. The future settings UI
// will replace this implementation with a DB read, leaving the IPC
// contract unchanged.

import os from "node:os";

export function getDefaultCwd(): string {
	return os.homedir();
}
```

- [ ] **Step 5: Wire IpcRouter to the new dependencies**

Edit `src/main/ipc-router.ts`. Update `RouterDeps` to accept the dialog handlers + default-cwd resolver:

```ts
import type { DialogHandlers } from "./dialog-handlers";

export interface RouterDeps {
	channels: ChannelsRepo;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: PiSessionManager;
	dialog: DialogHandlers;
	getDefaultCwd: () => string;
}
```

Append the two handlers inside the constructor:

```ts
		this.register("dialog.openFolder", async (args) => {
			return ok(await this.deps.dialog.openFolder({ defaultPath: args.defaultPath }));
		});
		this.register("settings.getDefaultCwd", async () => {
			return ok({ cwd: this.deps.getDefaultCwd() });
		});
```

- [ ] **Step 6: Wire main entry**

Edit `src/main/index.ts`. Add imports and pass the new deps to `IpcRouter`:

```ts
import { electronDialogHandlers } from "./dialog-handlers";
import { getDefaultCwd } from "./default-cwd";
```

And update the router construction to:

```ts
	router = new IpcRouter({
		channels,
		channelSessions,
		piSessionManager,
		dialog: electronDialogHandlers,
		getDefaultCwd,
	});
```

- [ ] **Step 7: Update the test setup**

Edit `tests/integration/ipc-router.test.ts`. Update the router construction in `beforeEach`:

```ts
	router = new IpcRouter({
		channels: new ChannelsRepo(db),
		channelSessions: new ChannelSessionsRepo(db),
		piSessionManager: piSessionManagerMock as unknown as PiSessionManager,
		dialog: {
			openFolder: async ({ defaultPath }) => {
				const result = await dialogShowOpenDialog({
					properties: ["openDirectory"],
					defaultPath,
				});
				if (result.canceled || result.filePaths.length === 0) {
					return { path: null };
				}
				return { path: result.filePaths[0] };
			},
		},
		getDefaultCwd: () => "/Users/test/home",
	});
```

- [ ] **Step 8: Run tests to verify they pass**

```
npm run typecheck && npm run test -- tests/integration/ipc-router.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main/dialog-handlers.ts src/main/default-cwd.ts src/main/ipc-router.ts src/main/index.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): dialog.openFolder + settings.getDefaultCwd"
```

---

## Phase C — Renderer hooks + util

### Task 10: util/label.ts

**Files:**
- Create: `src/renderer/util/label.ts`
- Create: `tests/unit/label.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/label.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	computeSessionLabel,
	formatFirstMessageLabel,
} from "../../src/renderer/util/label";

describe("computeSessionLabel", () => {
	it("returns label when set", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s-abc",
				cwd: "/home/x/macpi",
				label: "named one",
			}),
		).toBe("named one");
	});

	it("falls back to cwd basename when label is null", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s-abc12345",
				cwd: "/home/x/macpi",
				label: null,
			}),
		).toBe("macpi");
	});

	it("falls back to short-id when cwd and label are null", () => {
		expect(
			computeSessionLabel({
				piSessionId: "abc12345-rest",
				cwd: null,
				label: null,
			}),
		).toBe("abc12345");
	});

	it("strips trailing slash from cwd before extracting basename", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s",
				cwd: "/home/x/macpi/",
				label: null,
			}),
		).toBe("macpi");
	});
});

describe("formatFirstMessageLabel", () => {
	it("formats as `basename: text` and ellipsizes long text", () => {
		const out = formatFirstMessageLabel(
			"macpi",
			"fix the build because it has been failing",
		);
		expect(out.startsWith("macpi: ")).toBe(true);
		expect(out.length).toBeLessThanOrEqual(48); // basename + ": " + 40
		expect(out.endsWith("…")).toBe(true);
	});

	it("does not ellipsize short text", () => {
		expect(formatFirstMessageLabel("macpi", "hi")).toBe("macpi: hi");
	});

	it("uses '(unlabeled)' when basename is empty", () => {
		expect(formatFirstMessageLabel("", "hi")).toBe("(unlabeled): hi");
	});

	it("collapses internal newlines/whitespace to single spaces", () => {
		expect(formatFirstMessageLabel("x", "a\n\nb\tc")).toBe("x: a b c");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm run test -- tests/unit/label.test.ts
```

Expected: file `src/renderer/util/label.ts` not found.

- [ ] **Step 3: Implement label.ts**

Create `src/renderer/util/label.ts`:

```ts
// Pure helpers for rendering and computing session labels.

export interface LabelInputs {
	piSessionId: string;
	cwd: string | null;
	label: string | null;
}

export function computeSessionLabel(input: LabelInputs): string {
	if (input.label) return input.label;
	const fromCwd = basename(input.cwd);
	if (fromCwd) return fromCwd;
	return input.piSessionId.slice(0, 8) || "(unlabeled)";
}

export function formatFirstMessageLabel(
	basename: string,
	text: string,
): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	const max = 40;
	const truncated =
		cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
	const head = basename.length > 0 ? basename : "(unlabeled)";
	return `${head}: ${truncated}`;
}

function basename(p: string | null): string | null {
	if (!p) return null;
	const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
	const idx = trimmed.lastIndexOf("/");
	if (idx === -1) return trimmed || null;
	return trimmed.slice(idx + 1) || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm run test -- tests/unit/label.test.ts
```

Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/util/label.ts tests/unit/label.test.ts
git commit -m "feat(util): label helpers"
```

---

### Task 11: queries.ts — new hooks

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add 9 new hooks**

Edit `src/renderer/queries.ts`. Append at the end of the file:

```ts
export function useRenameChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; name: string }) =>
			invoke("channels.rename", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
	});
}

export function useDeleteChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; force?: boolean }) =>
			invoke("channels.delete", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["channels"] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

export function useRenameSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string; label: string }) =>
			invoke("session.rename", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["session.meta", vars.piSessionId] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

export function useDeleteSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string }) =>
			invoke("session.delete", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
	});
}

export function useSetFirstMessageLabel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { piSessionId: string; text: string }) =>
			invoke("session.setFirstMessageLabel", input),
		onSuccess: (_d, vars) => {
			qc.invalidateQueries({ queryKey: ["session.meta", vars.piSessionId] });
			qc.invalidateQueries({ queryKey: ["sessions"] });
		},
	});
}

export function useSessionMeta(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.meta", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.getMeta", { piSessionId })
				: Promise.resolve(null),
		enabled: !!piSessionId,
	});
}

export function useOpenFolder() {
	return useMutation({
		mutationFn: (input: { defaultPath?: string } = {}) =>
			invoke("dialog.openFolder", input),
	});
}

export function useDefaultCwd() {
	return useQuery({
		queryKey: ["settings.defaultCwd"],
		queryFn: () => invoke("settings.getDefaultCwd", {}),
		staleTime: Number.POSITIVE_INFINITY,
	});
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "feat(renderer): add channel/session/dialog/settings query hooks"
```

---

## Phase D — Sidebar UI

### Task 12: ConfirmDialog component

**Files:**
- Create: `src/renderer/components/ConfirmDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/ConfirmDialog.tsx`:

```tsx
// Modal dialog for destructive confirmations. Click-outside / Escape
// cancels. Caller controls open state.

import React from "react";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	body: React.ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onCancel]);

	if (!open) return null;
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onCancel}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="w-80 rounded bg-zinc-800 p-4 text-zinc-100 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div className="mb-2 text-sm font-semibold">{title}</div>
				<div className="mb-4 text-xs text-zinc-300">{body}</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={`rounded px-3 py-1 text-xs ${
							destructive
								? "bg-red-600 hover:bg-red-500"
								: "bg-indigo-600 hover:bg-indigo-500"
						}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ConfirmDialog.tsx
git commit -m "feat(ui): ConfirmDialog component"
```

---

### Task 13: RowMenu component

**Files:**
- Create: `src/renderer/components/RowMenu.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/RowMenu.tsx`:

```tsx
// Hover-revealed ⋮ menu for sidebar rows. Click toggles the popover;
// outside-click and Escape close it.

import React from "react";

export interface RowMenuItem {
	label: string;
	onClick: () => void;
	destructive?: boolean;
}

export interface RowMenuProps {
	items: RowMenuItem[];
	/** Show the trigger always (true) or only on hover (false, default). */
	alwaysVisible?: boolean;
}

export function RowMenu({ items, alwaysVisible }: RowMenuProps) {
	const [open, setOpen] = React.useState(false);
	const wrapRef = React.useRef<HTMLSpanElement | null>(null);

	React.useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<span ref={wrapRef} className="relative inline-block">
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setOpen((v) => !v);
				}}
				aria-label="row menu"
				className={`rounded px-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 ${
					alwaysVisible ? "" : "opacity-0 group-hover:opacity-100"
				}`}
			>
				⋮
			</button>
			{open && (
				<div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded bg-zinc-800 shadow-lg">
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setOpen(false);
								item.onClick();
							}}
							className={`block w-full px-3 py-1 text-left text-xs hover:bg-zinc-700 ${
								item.destructive ? "text-red-300" : "text-zinc-200"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>
			)}
		</span>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/RowMenu.tsx
git commit -m "feat(ui): RowMenu — hover-revealed ⋮ menu"
```

---

### Task 14: NewSessionForm component

**Files:**
- Create: `src/renderer/components/NewSessionForm.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/NewSessionForm.tsx`:

```tsx
// Inline form for creating a session: cwd text input + 📁 picker + Create.
// Default cwd from settings.getDefaultCwd. Last-used cwd persists in
// localStorage to override the default for the next session.

import React from "react";
import { useDefaultCwd, useOpenFolder } from "../queries";

const LAST_CWD_KEY = "macpi.lastCwd";

export interface NewSessionFormProps {
	pending: boolean;
	error: string | null;
	onSubmit: (cwd: string) => void;
}

export function NewSessionForm({ pending, error, onSubmit }: NewSessionFormProps) {
	const defaultCwd = useDefaultCwd();
	const openFolder = useOpenFolder();
	const [cwd, setCwd] = React.useState<string>("");

	// Seed the input. Priority: last-used > settings default > empty.
	React.useEffect(() => {
		if (cwd) return;
		const last = window.localStorage.getItem(LAST_CWD_KEY);
		if (last) {
			setCwd(last);
			return;
		}
		if (defaultCwd.data?.cwd) setCwd(defaultCwd.data.cwd);
	}, [cwd, defaultCwd.data]);

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: cwd || undefined });
		if (r.path) setCwd(r.path);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = cwd.trim();
		if (!trimmed) return;
		window.localStorage.setItem(LAST_CWD_KEY, trimmed);
		onSubmit(trimmed);
	};

	return (
		<form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<input
					type="text"
					placeholder="cwd"
					value={cwd}
					onChange={(e) => setCwd(e.target.value)}
					className="flex-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
					title={cwd}
				/>
				<button
					type="button"
					onClick={handleBrowse}
					title="Browse for folder"
					className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-600"
				>
					📁
				</button>
			</div>
			<button
				type="submit"
				disabled={pending || !cwd.trim()}
				className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
			>
				{pending ? "creating…" : "+ new session"}
			</button>
			{error && (
				<div
					className="mt-1 rounded bg-red-900/40 px-2 py-1 text-[11px] text-red-200"
					title={error}
				>
					{error}
				</div>
			)}
		</form>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/NewSessionForm.tsx
git commit -m "feat(ui): NewSessionForm with cwd picker"
```

---

### Task 15: ChannelSidebar — channel rename + delete

**Files:**
- Modify: `src/renderer/components/ChannelSidebar.tsx`

- [ ] **Step 1: Update component**

Replace `src/renderer/components/ChannelSidebar.tsx` with:

```tsx
// Left sidebar showing channels and sessions within the selected channel.
// Per-row hover-revealed ⋮ menus expose Rename and Delete. New session
// creation lives in NewSessionForm (cwd picker).

import React from "react";
import { IpcError } from "../ipc";
import {
	useChannels,
	useCreateChannel,
	useCreateSession,
	useDeleteChannel,
	useDeleteSession,
	useRenameChannel,
	useRenameSession,
	useSessionsForChannel,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewSessionForm } from "./NewSessionForm";
import { RowMenu } from "./RowMenu";
import { SessionRow } from "./SessionRow";

export function ChannelSidebar({
	selectedChannelId,
	selectedSessionId,
	onSelectChannel,
	onSelectSession,
}: {
	selectedChannelId: string | null;
	selectedSessionId: string | null;
	onSelectChannel: (id: string | null) => void;
	onSelectSession: (id: string | null) => void;
}) {
	const channels = useChannels();
	const createChannel = useCreateChannel();
	const renameChannel = useRenameChannel();
	const deleteChannel = useDeleteChannel();
	const createSession = useCreateSession();
	const renameSession = useRenameSession();
	const deleteSession = useDeleteSession();
	const sessions = useSessionsForChannel(selectedChannelId);

	const [newName, setNewName] = React.useState("");
	const [editingChannelId, setEditingChannelId] = React.useState<string | null>(
		null,
	);
	const [editingChannelDraft, setEditingChannelDraft] = React.useState("");
	const [confirmChannelDelete, setConfirmChannelDelete] = React.useState<{
		id: string;
		name: string;
		count: number;
	} | null>(null);
	const [confirmSessionDelete, setConfirmSessionDelete] = React.useState<{
		piSessionId: string;
	} | null>(null);

	const handleCreateChannel = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		const result = await createChannel.mutateAsync({ name });
		setNewName("");
		onSelectChannel(result.id);
	};

	const handleCreateSession = async (cwd: string) => {
		if (!selectedChannelId) return;
		const result = await createSession.mutateAsync({
			channelId: selectedChannelId,
			cwd,
		});
		onSelectSession(result.piSessionId);
	};

	const handleDeleteChannel = async (force: boolean) => {
		if (!confirmChannelDelete) return;
		const id = confirmChannelDelete.id;
		const r = await deleteChannel.mutateAsync({ id, force });
		setConfirmChannelDelete(null);
		if (r) {
			if (selectedChannelId === id) {
				onSelectChannel(null);
				onSelectSession(null);
			}
		}
	};

	const handleRequestDeleteChannel = async (id: string, name: string) => {
		// Probe with no force; invoke() throws IpcError on the non_empty path.
		try {
			await deleteChannel.mutateAsync({ id });
			if (selectedChannelId === id) {
				onSelectChannel(null);
				onSelectSession(null);
			}
		} catch (e) {
			if (e instanceof IpcError && e.code === "non_empty") {
				const m = e.message.match(/(\d+)/);
				const count = m ? Number(m[1]) : 1;
				setConfirmChannelDelete({ id, name, count });
				return;
			}
			throw e;
		}
	};

	return (
		<div className="flex w-60 flex-col gap-1 bg-[#26262b] p-3 text-sm text-zinc-200">
			<div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
				Channels
			</div>
			{channels.data?.channels.map((c) =>
				editingChannelId === c.id ? (
					<input
						key={c.id}
						autoFocus
						value={editingChannelDraft}
						onChange={(e) => setEditingChannelDraft(e.target.value)}
						onBlur={() => {
							const name = editingChannelDraft.trim();
							if (name && name !== c.name) {
								renameChannel.mutate({ id: c.id, name });
							}
							setEditingChannelId(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								(e.target as HTMLInputElement).blur();
							} else if (e.key === "Escape") {
								setEditingChannelId(null);
							}
						}}
						className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 outline-none"
					/>
				) : (
					<div
						key={c.id}
						className={`group flex items-center gap-1 rounded ${
							selectedChannelId === c.id
								? "bg-zinc-700 text-white"
								: "text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						<button
							type="button"
							onClick={() => onSelectChannel(c.id)}
							className="flex-1 px-2 py-1 text-left"
						>
							# {c.name}
						</button>
						<RowMenu
							items={[
								{
									label: "Rename",
									onClick: () => {
										setEditingChannelDraft(c.name);
										setEditingChannelId(c.id);
									},
								},
								{
									label: "Delete",
									destructive: true,
									onClick: () => handleRequestDeleteChannel(c.id, c.name),
								},
							]}
						/>
					</div>
				),
			)}
			<form className="mt-2 flex gap-1" onSubmit={handleCreateChannel}>
				<input
					className="flex-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 placeholder-zinc-500 outline-none"
					placeholder="new channel"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
				<button
					type="submit"
					className="rounded bg-zinc-700 px-2 hover:bg-zinc-600"
				>
					+
				</button>
			</form>

			{selectedChannelId && (
				<>
					<div className="mt-3 text-[10px] uppercase tracking-widest text-zinc-500">
						Sessions
					</div>
					{sessions.data?.piSessionIds.map((id) => (
						<SessionRow
							key={id}
							piSessionId={id}
							selected={selectedSessionId === id}
							onSelect={() => onSelectSession(id)}
							onRename={(label) =>
								renameSession.mutate({ piSessionId: id, label })
							}
							onRequestDelete={() =>
								setConfirmSessionDelete({ piSessionId: id })
							}
						/>
					))}
					<NewSessionForm
						pending={createSession.isPending}
						error={
							createSession.error
								? createSession.error.message
								: null
						}
						onSubmit={handleCreateSession}
					/>
				</>
			)}

			<ConfirmDialog
				open={!!confirmChannelDelete}
				title="Delete channel?"
				body={
					confirmChannelDelete && (
						<>
							Channel <code>#{confirmChannelDelete.name}</code> has{" "}
							{confirmChannelDelete.count} session(s). Delete the channel and
							all its sessions? Pi's session files on disk are preserved.
						</>
					)
				}
				confirmLabel="Delete"
				destructive
				onConfirm={() => handleDeleteChannel(true)}
				onCancel={() => setConfirmChannelDelete(null)}
			/>
			<ConfirmDialog
				open={!!confirmSessionDelete}
				title="Delete session?"
				body="This removes the session from the sidebar. Pi's session file on disk is preserved."
				confirmLabel="Delete"
				destructive
				onConfirm={async () => {
					if (!confirmSessionDelete) return;
					const id = confirmSessionDelete.piSessionId;
					await deleteSession.mutateAsync({ piSessionId: id });
					if (selectedSessionId === id) onSelectSession(null);
					setConfirmSessionDelete(null);
				}}
				onCancel={() => setConfirmSessionDelete(null)}
			/>
		</div>
	);
}
```

- [ ] **Step 2: Note: SessionRow is created in Task 16**

Typecheck will fail at this point because `SessionRow` doesn't exist yet. Move directly to Task 16.

---

### Task 16: SessionRow component

**Files:**
- Create: `src/renderer/components/SessionRow.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/SessionRow.tsx`:

```tsx
// One row in the sessions list. Reads its own metadata via useSessionMeta
// so it re-renders independently when the user renames or auto-label fires.
// Provides hover-revealed ⋮ menu with Rename and Delete.

import React from "react";
import { useSessionMeta } from "../queries";
import { computeSessionLabel } from "../util/label";
import { RowMenu } from "./RowMenu";

export interface SessionRowProps {
	piSessionId: string;
	selected: boolean;
	onSelect: () => void;
	onRename: (label: string) => void;
	onRequestDelete: () => void;
}

export function SessionRow({
	piSessionId,
	selected,
	onSelect,
	onRename,
	onRequestDelete,
}: SessionRowProps) {
	const meta = useSessionMeta(piSessionId);
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState("");

	const label = computeSessionLabel({
		piSessionId,
		cwd: meta.data?.cwd ?? null,
		label: meta.data?.label ?? null,
	});

	if (editing) {
		return (
			<input
				autoFocus
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => {
					const trimmed = draft.trim();
					if (trimmed && trimmed !== label) {
						onRename(trimmed);
					}
					setEditing(false);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						(e.target as HTMLInputElement).blur();
					} else if (e.key === "Escape") {
						setEditing(false);
					}
				}}
				className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none"
			/>
		);
	}

	return (
		<div
			className={`group flex items-center gap-1 rounded text-xs ${
				selected ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
			}`}
			title={meta.data?.cwd ?? piSessionId}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex-1 truncate px-2 py-1 text-left"
			>
				▸ {label}
			</button>
			<RowMenu
				items={[
					{
						label: "Rename",
						onClick: () => {
							setDraft(label);
							setEditing(true);
						},
					},
					{
						label: "Delete",
						destructive: true,
						onClick: onRequestDelete,
					},
				]}
			/>
		</div>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit (combined with Task 15)**

```bash
git add src/renderer/components/ChannelSidebar.tsx src/renderer/components/SessionRow.tsx
git commit -m "feat(ui): channel/session rename + delete with ⋮ menus"
```

---

## Phase E — Auto-label + breadcrumb

### Task 17: timeline-state — auto-label on first user message

**Files:**
- Modify: `src/renderer/state/timeline-state.ts`
- Modify: `src/renderer/components/ChatPane.tsx`

The auto-label fires once per session when the user sends their first message. We detect "first message" client-side from the timeline state, and dispatch `session.setFirstMessageLabel` from `ChatPane.send` (not from inside `useTimeline`, to keep the hook free of mutation side-effects).

- [ ] **Step 1: Modify ChatPane.tsx**

Edit `src/renderer/components/ChatPane.tsx`:

Add the import:

```ts
import {
	useAbortSession,
	useAttachSession,
	useClearQueue,
	usePromptSession,
	useRemoveFromQueue,
	useSessionMeta,
	useSetFirstMessageLabel,
} from "../queries";
import { computeSessionLabel, formatFirstMessageLabel } from "../util/label";
```

Inside the component body, alongside the existing mutations:

```ts
	const setFirstMessageLabelMutation = useSetFirstMessageLabel();
	const sessionMeta = useSessionMeta(piSessionId);
```

Inside the `send` function, before any of the mutateAsync calls and after `appendUserMessage(text);`, insert the auto-label trigger:

```ts
		// Auto-label on the first user message, only if the user hasn't
		// already named the session. We detect "first user message" by
		// inspecting the snapshot before appendUserMessage runs.
		const isFirstUserMessage =
			snapshot.timeline.every((entry) => entry.kind !== "user");
		if (isFirstUserMessage && piSessionId) {
			const basename = computeSessionLabel({
				piSessionId,
				cwd: sessionMeta.data?.cwd ?? null,
				label: null,
			});
			setFirstMessageLabelMutation.mutate({
				piSessionId,
				text: formatFirstMessageLabel(basename, text),
			});
		}
```

Note: `appendUserMessage` adds a user entry to `snapshot.timeline`, so we must check **before** calling it. Since `appendUserMessage` is the line right above this block in the original code, move our new block to come **before** `appendUserMessage(text)`.

The final ordering in `send` should be:

```ts
	async function send(text: string, intent: SendIntent) {
		const isFirstUserMessage =
			snapshot.timeline.every((entry) => entry.kind !== "user");
		if (isFirstUserMessage && piSessionId) {
			const basename = computeSessionLabel({
				piSessionId,
				cwd: sessionMeta.data?.cwd ?? null,
				label: null,
			});
			setFirstMessageLabelMutation.mutate({
				piSessionId,
				text: formatFirstMessageLabel(basename, text),
			});
		}
		appendUserMessage(text);
		try {
			// ... existing intent dispatch
```

- [ ] **Step 2: Verify typecheck + tests**

```
npm run typecheck && npm run test
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChatPane.tsx
git commit -m "feat(chat): auto-label session on first user message"
```

---

### Task 18: BreadcrumbBar component

**Files:**
- Create: `src/renderer/components/BreadcrumbBar.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/BreadcrumbBar.tsx`:

```tsx
// Single-line breadcrumb above the timeline. Renders:
// `# channel › label · /full/cwd · sess-abc12345`
// Long cwds truncate via CSS overflow.

import { computeSessionLabel } from "../util/label";

export interface BreadcrumbBarProps {
	channelName: string | null;
	piSessionId: string;
	cwd: string | null;
	label: string | null;
}

export function BreadcrumbBar({
	channelName,
	piSessionId,
	cwd,
	label,
}: BreadcrumbBarProps) {
	const display = computeSessionLabel({ piSessionId, cwd, label });
	const shortId = `sess-${piSessionId.slice(0, 8)}`;
	return (
		<div className="flex items-center gap-1 overflow-hidden whitespace-nowrap border-b border-zinc-800 pb-2 text-xs text-zinc-500">
			{channelName && (
				<>
					<span className="text-zinc-400">#&nbsp;{channelName}</span>
					<span>›</span>
				</>
			)}
			<span className="text-zinc-300">{display}</span>
			{cwd && (
				<>
					<span>·</span>
					<span className="truncate" title={cwd}>
						{cwd}
					</span>
				</>
			)}
			<span>·</span>
			<span className="text-zinc-600" title={piSessionId}>
				{shortId}
			</span>
		</div>
	);
}
```

- [ ] **Step 2: Verify typecheck**

```
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/BreadcrumbBar.tsx
git commit -m "feat(ui): BreadcrumbBar"
```

---

### Task 19: ChatPane — wire BreadcrumbBar (with `session.findChannel` IPC)

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/ChatPane.tsx`
- Modify: `tests/integration/ipc-router.test.ts`

The breadcrumb needs the channel name for the current session. The renderer doesn't have a direct piSessionId → channel mapping (channels are queried independently per-channel via `useSessionsForChannel`), so we add a tiny new IPC method `session.findChannel`. Total new IPC methods: 7 (spec listed 6 — this is the addition).

- [ ] **Step 1: Add session.findChannel to ipc-types**

Add to `src/shared/ipc-types.ts`:

```ts
	"session.findChannel": {
		req: { piSessionId: string };
		res: { channelId: string | null };
	};
```

- [ ] **Step 2: Add the handler**

Append inside the `IpcRouter` constructor in `src/main/ipc-router.ts`:

```ts
		this.register("session.findChannel", async (args) => {
			return ok({
				channelId: this.deps.channelSessions.findChannelOf(args.piSessionId),
			});
		});
```

- [ ] **Step 3: Add the hook**

Append in `src/renderer/queries.ts`:

```ts
export function useSessionChannel(piSessionId: string | null) {
	return useQuery({
		queryKey: ["session.channel", piSessionId],
		queryFn: () =>
			piSessionId
				? invoke("session.findChannel", { piSessionId })
				: Promise.resolve({ channelId: null }),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
	});
}
```

- [ ] **Step 4: Wire ChatPane**

In `src/renderer/components/ChatPane.tsx`:

Add imports (note: do not duplicate any that already exist):

```ts
import { useChannels, useSessionChannel } from "../queries";
import { BreadcrumbBar } from "./BreadcrumbBar";
```

Inside the component body, alongside the other hook calls:

```ts
	const channels = useChannels();
	const sessionChannel = useSessionChannel(piSessionId);
	const channelName =
		channels.data?.channels.find(
			(c) => c.id === sessionChannel.data?.channelId,
		)?.name ?? null;
```

Replace the existing breadcrumb line:

```tsx
				<div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
					session {piSessionId}
				</div>
```

with:

```tsx
				<BreadcrumbBar
					channelName={channelName}
					piSessionId={piSessionId}
					cwd={sessionMeta.data?.cwd ?? null}
					label={sessionMeta.data?.label ?? null}
				/>
```

(`sessionMeta` was added in Task 17.)

- [ ] **Step 5: Add L2 tests for session.findChannel**

Append to `tests/integration/ipc-router.test.ts`:

```ts
	it("session.findChannel returns the owning channel id", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fc",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/x",
		});

		const r = await router.dispatch("session.findChannel", {
			piSessionId: "s-fc",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.channelId).toBe(c.data.id);
	});

	it("session.findChannel returns null for unknown session", async () => {
		const r = await router.dispatch("session.findChannel", {
			piSessionId: "no-such",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.channelId).toBeNull();
	});
```

- [ ] **Step 6: Run typecheck + tests**

```
npm run typecheck && npm run test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-types.ts src/main/ipc-router.ts src/renderer/queries.ts src/renderer/components/ChatPane.tsx tests/integration/ipc-router.test.ts
git commit -m "feat(chat): breadcrumb bar with channel + label + cwd + short-id"
```

---

## Phase F — Final gates + smoke

### Task 20: Full quality gates

**Files:** none

- [ ] **Step 1: Run full quality gates**

```bash
npm run typecheck
npm run lint
npm run test
```

Expected:
- typecheck: clean
- lint: 0 errors, 0 warnings
- test: **all tests pass** (≥80, was 67 before this plan).

- [ ] **Step 2: Manual smoke test**

Run the dev app:

```bash
npm start
```

Walk through the smoke checklist from spec §11 (Manual smoke):

1. Create channel `foo`, then channel `bar` → both auto-focus.
2. Hover over `foo` → click `⋮` → Rename → type `baz` → Enter → sidebar shows `# baz`.
3. With `# baz` selected, type a custom cwd in NewSessionForm (or click 📁 and select one) → click `+ new session`. Session is created and auto-selected. Breadcrumb shows `# baz › <cwd-basename> · /full/cwd · sess-<id>`.
4. Send first user message `"fix the build"` → after a moment, the sidebar label and breadcrumb update to `<basename>: fix the build`.
5. Hover the session → `⋮` → Rename → type `my session` → Enter → sidebar + breadcrumb update.
6. `⋮` → Delete → confirm modal → Delete. Session disappears from the sidebar; chat pane clears to empty-state.
7. Hover `# baz` → `⋮` → Delete → if there are sessions, modal: "Channel #baz has N sessions" → confirm → channel + sessions removed.
8. Restart the app → sidebar shows the persisted channels and sessions; clicking a session restores history; the auto-label persists.

- [ ] **Step 3: If smoke uncovers issues, file them as follow-up tasks** — do not silently fix smoke regressions before commit; surface them so the user can decide priority.

---

## Self-review

**Spec coverage:**
- §2 Goal 1 (rename/delete channels) → Tasks 7, 11, 15.
- §2 Goal 2 (cwd picker w/ default) → Tasks 9, 11, 14.
- §2 Goal 3 (auto-derived + editable session labels) → Tasks 1, 2, 6, 8, 10, 11, 16, 17.
- §2 Goal 4 (delete session + DB-only) → Tasks 5, 6, 11, 15, 16.
- §2 Goal 5 (single-line breadcrumb) → Tasks 18, 19.
- §2 Goal 6 (auto-focus on create) → Task 15 (channel + session creation paths use `mutateAsync` + onSelect).
- §3 Non-goals — none accidentally implemented.
- §5.1 Migration shape — Task 1.
- §6 Component changes table — covered.
- §7 IPC method list — Tasks 4-9 (5 NEW + 1 EXTENDED + 1 added during plan: `session.findChannel`). Plan §19 Step 1 documents `session.findChannel`.
- §8 Auto-label flow — Task 17 follows the spec's renderer-side detection.
- §10 Error handling — `non_empty` round-trip covered in Task 7 + 15.
- §11 Testing strategy — L1 (Task 10), L2 (Tasks 1-3, 6-9, 19), L3 skipped per spec.

**Placeholder scan:** none.

**Type consistency:** `SessionMeta.label`, `SessionMeta.labelUserSet` defined Task 2 and used downstream. `LabelInputs` shape consistent across `computeSessionLabel`, `BreadcrumbBar`, `SessionRow`, ChatPane auto-label.

**Note on Task 19's mid-task discovery:** I added a new IPC method `session.findChannel` while writing Task 19 because the alternative (cross-cache lookup in renderer) was ugly. This is captured inline. Spec §7 listed 6 new methods; the implementation adds 7. The added method is straightforward and the spec's intent (single-line breadcrumb with channel name) requires it.
