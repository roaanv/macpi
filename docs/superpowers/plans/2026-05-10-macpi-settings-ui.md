# Settings UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Settings UI (Theme / Font / Defaults) and a per-channel Settings dialog. Move cwd to per-channel (with NewSessionForm preserving an advanced override). Ship full light + dark + auto theming.

**Architecture:** New `0004-channel_cwd.sql` migration adds `channels.cwd`. New `AppSettingsRepo` wraps the existing-but-unused `settings_global` table. New `app-settings-keys.ts` defines typed defaults (theme, font, defaultCwd) — kept separate from the existing `settings/resolver.ts` (pi-runtime cascade scaffold). 3 new IPC methods + extended `session.create`. New components: `SettingsDialog`, `GlobalSettingsDialog`, `ChannelSettingsDialog`, `ThemeSettings`, `FontSettings`, `DefaultsSettings`, `SettingsApplier`. Tailwind switches to `darkMode: "class"`; ~17 component files swept to semantic classes.

**Tech Stack:** Electron 42, TypeScript, React 18, TanStack Query 5, Tailwind v3 (class darkMode), Vitest 3, Biome v2, `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-05-10-settings-ui-design.md`.

---

## Pre-flight

Create an isolated worktree off `main` (HEAD currently `9863aa0` — spec commit, on top of `49c6fb6` channel/session UX polish) via `superpowers:using-git-worktrees`.

After worktree creation:

```bash
npm install
npm run typecheck && npm run lint && npm run test
```

Expected baseline: typecheck clean, biome clean, **97/97 tests passing**.

**Heads-up to implementers:**
- IDE-LSP false positives (`Cannot find module '@earendil-works/...'`, JSX intrinsic elements, `vitest`). **`npm run typecheck` is ground truth.**
- `node:sqlite` rows: cast with `as unknown as <RowType>`.
- Biome may auto-format on commit; run `npx biome check --write <file>` to fix in advance.
- Existing `src/main/settings/resolver.ts` and `src/shared/settings-keys.ts` are pi-runtime cascade scaffolds (unused). **Do NOT modify them.** This plan adds parallel app-settings infrastructure.

---

## File Structure

```
src/main/
  db/migrations/0004-channel_cwd.sql                     [NEW]
  repos/channels.ts                                      [MODIFY: +setCwd, getById returns cwd]
  repos/app-settings.ts                                  [NEW: AppSettingsRepo]
  ipc-router.ts                                          [MODIFY: +3 methods, session.create resolves cwd]
  default-cwd.ts                                         [MODIFY: read from AppSettingsRepo]
  index.ts                                               [MODIFY: instantiate AppSettingsRepo, wire to router + default-cwd]

src/shared/
  ipc-types.ts                                           [MODIFY: +3 method types, session.create cwd optional]
  app-settings-keys.ts                                   [NEW: shared types, defaults, accessors]
  cwd-resolver.ts                                        [NEW: pure resolveCwd]

src/renderer/
  components/SettingsDialog.tsx                          [NEW]
  components/GlobalSettingsDialog.tsx                    [NEW]
  components/ChannelSettingsDialog.tsx                   [NEW]
  components/ThemeSettings.tsx                           [NEW]
  components/FontSettings.tsx                            [NEW]
  components/DefaultsSettings.tsx                        [NEW]
  components/SettingsApplier.tsx                         [NEW]
  components/ModeRail.tsx                                [MODIFY: gear icon + click handler]
  components/ChannelSidebar.tsx                          [MODIFY: contextmenu + ⋮ Settings entry]
  components/NewSessionForm.tsx                          [MODIFY: pre-fill from channel cwd]
  components/[~17 files]                                 [MODIFY: hardcoded colors → semantic classes]
  App.tsx                                                [MODIFY: dialog state + SettingsApplier]
  queries.ts                                             [MODIFY: +useSettings, useSetSetting, useSetChannelCwd]
  styles.css                                             [MODIFY: @layer components block]

tailwind.config.cjs                                      [MODIFY: darkMode: "class"]

tests/
  unit/app-settings-keys.test.ts                         [NEW]
  unit/cwd-resolver.test.ts                              [NEW]
  unit/migrations.test.ts                                [MODIFY: bump version 3 → 4]
  integration/app-settings-repo.test.ts                  [NEW]
  integration/channels-repo.test.ts                      [MODIFY: + cwd round-trip]
  integration/ipc-router.test.ts                         [MODIFY: + ~6 new test cases]
```

---

## Phase A — DB foundation

### Task 1: Migration 0004 — channels.cwd

**Files:**
- Create: `src/main/db/migrations/0004-channel_cwd.sql`
- Modify: `tests/unit/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/migrations.test.ts`, update the version expectations from 3 to 4. Find the two `expect(currentVersion(db)).toBe(3)` calls and change them to `.toBe(4)`. Append a new test before the closing `});`:

```ts
	it("004 adds cwd column to channels", () => {
		const memDb = openDb({ filename: ":memory:" });
		runMigrations(memDb);
		const cols = memDb.raw
			.prepare("PRAGMA table_info(channels)")
			.all() as unknown as Array<{ name: string }>;
		const colNames = cols.map((c) => c.name);
		expect(colNames).toContain("cwd");
		memDb.close();
	});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/unit/migrations.test.ts
```

- [ ] **Step 3: Create the migration**

Create `src/main/db/migrations/0004-channel_cwd.sql`:

```sql
ALTER TABLE channels ADD COLUMN cwd TEXT;
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/unit/migrations.test.ts
npm run test
```

Expected: 98/98 (was 97; +1).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/0004-channel_cwd.sql tests/unit/migrations.test.ts
git commit -m "feat(db): add cwd column to channels"
```

---

### Task 2: ChannelsRepo.setCwd + Channel type extension

**Files:**
- Modify: `src/main/repos/channels.ts`
- Modify: `tests/integration/channels-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside the `describe("ChannelsRepo", ...)` block in `tests/integration/channels-repo.test.ts`:

```ts
	it("create returns cwd as null by default", () => {
		const c = repo.create({ name: "x" });
		expect(c.cwd).toBeNull();
	});

	it("setCwd persists the cwd value", () => {
		const c = repo.create({ name: "x" });
		repo.setCwd(c.id, "/Users/x/code/macpi");
		expect(repo.getById(c.id)?.cwd).toBe("/Users/x/code/macpi");
	});

	it("setCwd with null clears the cwd", () => {
		const c = repo.create({ name: "x" });
		repo.setCwd(c.id, "/Users/x/code/macpi");
		repo.setCwd(c.id, null);
		expect(repo.getById(c.id)?.cwd).toBeNull();
	});

	it("list includes cwd on each channel", () => {
		const a = repo.create({ name: "a" });
		const b = repo.create({ name: "b" });
		repo.setCwd(b.id, "/path");
		const all = repo.list();
		expect(all.find((c) => c.id === a.id)?.cwd).toBeNull();
		expect(all.find((c) => c.id === b.id)?.cwd).toBe("/path");
	});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/integration/channels-repo.test.ts
```

Expected: `cwd` property doesn't exist on returned channel; `setCwd` is not a function.

- [ ] **Step 3: Update Channel interface + queries**

Edit `src/main/repos/channels.ts`. Update the `Channel` interface:

```ts
export interface Channel {
	id: string;
	name: string;
	position: number;
	icon: string | null;
	cwd: string | null;
	createdAt: number;
}
```

Update `create` to return cwd:

```ts
	create(input: CreateChannelInput): Channel {
		const id = randomUUID();
		const now = Date.now();
		const nextPos = this.nextPosition();
		this.db.raw
			.prepare(
				"INSERT INTO channels (id, name, position, icon, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(id, input.name, nextPos, input.icon ?? null, now);
		return {
			id,
			name: input.name,
			position: nextPos,
			icon: input.icon ?? null,
			cwd: null,
			createdAt: now,
		};
	}
```

Update `list` to include cwd in the SELECT:

```ts
	list(): Channel[] {
		const rows = this.db.raw
			.prepare(
				"SELECT id, name, position, icon, cwd, created_at as createdAt FROM channels ORDER BY position ASC",
			)
			.all() as unknown as Channel[];
		return rows;
	}
```

Update `getById` to include cwd:

```ts
	getById(id: string): Channel | null {
		const row = this.db.raw
			.prepare(
				"SELECT id, name, position, icon, cwd, created_at as createdAt FROM channels WHERE id = ?",
			)
			.get(id) as unknown as Channel | undefined;
		return row ?? null;
	}
```

Add a `setCwd` method, placed after the existing `delete` method:

```ts
	setCwd(id: string, cwd: string | null): void {
		this.db.raw
			.prepare("UPDATE channels SET cwd = ? WHERE id = ?")
			.run(cwd, id);
	}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/integration/channels-repo.test.ts
npm run typecheck
npm run lint
npm run test
```

Expected: 102/102 (was 98; +4).

- [ ] **Step 5: Commit**

```bash
git add src/main/repos/channels.ts tests/integration/channels-repo.test.ts
git commit -m "feat(repo): add cwd to Channel type + setCwd method"
```

---

## Phase B — Pure utils (shared)

### Task 3: shared/app-settings-keys.ts

**Files:**
- Create: `src/shared/app-settings-keys.ts`
- Create: `tests/unit/app-settings-keys.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/app-settings-keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	APP_SETTINGS_DEFAULTS,
	getDefaultCwd,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getTheme,
} from "../../src/shared/app-settings-keys";

describe("app-settings-keys", () => {
	it("getTheme returns default 'auto' when unset", () => {
		expect(getTheme({})).toBe("auto");
	});

	it("getTheme returns the stored value when valid", () => {
		expect(getTheme({ theme: "light" })).toBe("light");
		expect(getTheme({ theme: "dark" })).toBe("dark");
		expect(getTheme({ theme: "auto" })).toBe("auto");
	});

	it("getTheme falls back to 'auto' for invalid value", () => {
		expect(getTheme({ theme: "invalid" })).toBe("auto");
		expect(getTheme({ theme: 123 })).toBe("auto");
	});

	it("getFontFamily returns default when unset", () => {
		expect(getFontFamily({})).toBe(APP_SETTINGS_DEFAULTS.fontFamily);
	});

	it("getFontFamily returns the stored value", () => {
		expect(getFontFamily({ fontFamily: "Inter" })).toBe("Inter");
	});

	it("getFontFamilyMono returns default when unset", () => {
		expect(getFontFamilyMono({})).toBe(APP_SETTINGS_DEFAULTS.fontFamilyMono);
	});

	it("getFontSize returns the per-region default when unset", () => {
		expect(getFontSize({}, "sidebar")).toBe(13);
		expect(getFontSize({}, "chatAssistant")).toBe(14);
		expect(getFontSize({}, "codeBlock")).toBe(13);
	});

	it("getFontSize returns the stored value when set", () => {
		expect(getFontSize({ "fontSize.sidebar": 16 }, "sidebar")).toBe(16);
	});

	it("getFontSize clamps non-numeric values to default", () => {
		expect(getFontSize({ "fontSize.sidebar": "huge" }, "sidebar")).toBe(13);
	});

	it("getDefaultCwd returns empty string when unset", () => {
		expect(getDefaultCwd({})).toBe("");
	});

	it("getDefaultCwd returns the stored value", () => {
		expect(getDefaultCwd({ defaultCwd: "/Users/x" })).toBe("/Users/x");
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/unit/app-settings-keys.test.ts
```

Expected: file `src/shared/app-settings-keys.ts` not found.

- [ ] **Step 3: Implement**

Create `src/shared/app-settings-keys.ts`:

```ts
// Typed accessors and defaults for app-level (UI/UX) settings persisted in
// the settings_global table. Distinct from src/main/settings/resolver.ts +
// src/shared/settings-keys.ts which scaffold the pi-runtime cascade for a
// future per-session settings UI.

export type ThemeMode = "light" | "dark" | "auto";

export type FontSizeRegion =
	| "sidebar"
	| "chatAssistant"
	| "chatUser"
	| "composer"
	| "codeBlock";

export const APP_SETTINGS_DEFAULTS = {
	theme: "auto" as ThemeMode,
	fontFamily: "system-ui",
	fontFamilyMono: "ui-monospace, SFMono-Regular, monospace",
	"fontSize.sidebar": 13,
	"fontSize.chatAssistant": 14,
	"fontSize.chatUser": 14,
	"fontSize.composer": 14,
	"fontSize.codeBlock": 13,
	defaultCwd: "",
} as const;

export type AppSettingsKey = keyof typeof APP_SETTINGS_DEFAULTS;

const THEME_VALUES: ReadonlySet<ThemeMode> = new Set([
	"light",
	"dark",
	"auto",
]);

export function getTheme(settings: Record<string, unknown>): ThemeMode {
	const v = settings.theme;
	if (typeof v === "string" && THEME_VALUES.has(v as ThemeMode)) {
		return v as ThemeMode;
	}
	return APP_SETTINGS_DEFAULTS.theme;
}

export function getFontFamily(settings: Record<string, unknown>): string {
	const v = settings.fontFamily;
	return typeof v === "string" && v.length > 0
		? v
		: APP_SETTINGS_DEFAULTS.fontFamily;
}

export function getFontFamilyMono(settings: Record<string, unknown>): string {
	const v = settings.fontFamilyMono;
	return typeof v === "string" && v.length > 0
		? v
		: APP_SETTINGS_DEFAULTS.fontFamilyMono;
}

const FONT_SIZE_KEY: Record<FontSizeRegion, AppSettingsKey> = {
	sidebar: "fontSize.sidebar",
	chatAssistant: "fontSize.chatAssistant",
	chatUser: "fontSize.chatUser",
	composer: "fontSize.composer",
	codeBlock: "fontSize.codeBlock",
};

export function getFontSize(
	settings: Record<string, unknown>,
	region: FontSizeRegion,
): number {
	const key = FONT_SIZE_KEY[region];
	const v = settings[key];
	return typeof v === "number" && Number.isFinite(v)
		? v
		: (APP_SETTINGS_DEFAULTS[key] as number);
}

export function getDefaultCwd(settings: Record<string, unknown>): string {
	const v = settings.defaultCwd;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.defaultCwd;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/unit/app-settings-keys.test.ts
npm run typecheck && npm run lint
```

Expected: 11/11 in this file. 113/113 overall (was 102; +11).

- [ ] **Step 5: Commit**

```bash
git add src/shared/app-settings-keys.ts tests/unit/app-settings-keys.test.ts
git commit -m "feat(shared): app-settings-keys typed accessors + defaults"
```

---

### Task 4: shared/cwd-resolver.ts

**Files:**
- Create: `src/shared/cwd-resolver.ts`
- Create: `tests/unit/cwd-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/cwd-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveCwd } from "../../src/shared/cwd-resolver";

describe("resolveCwd", () => {
	it("returns the explicit override when provided", () => {
		expect(
			resolveCwd({
				override: "/explicit",
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/explicit");
	});

	it("falls back to channelCwd when no override", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/channel");
	});

	it("falls back to defaultCwd when channel cwd is null", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: null,
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/default");
	});

	it("falls back to homeDir when default cwd is empty", () => {
		expect(
			resolveCwd({
				override: undefined,
				channelCwd: null,
				defaultCwd: "",
				homeDir: "/home",
			}),
		).toBe("/home");
	});

	it("treats empty-string override as no override", () => {
		expect(
			resolveCwd({
				override: "",
				channelCwd: "/channel",
				defaultCwd: "/default",
				homeDir: "/home",
			}),
		).toBe("/channel");
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/unit/cwd-resolver.test.ts
```

- [ ] **Step 3: Implement**

Create `src/shared/cwd-resolver.ts`:

```ts
// Pure cwd resolution. Order: explicit override → channel cwd →
// global defaultCwd → homeDir. Empty strings count as "unset".

export interface CwdInputs {
	override: string | undefined;
	channelCwd: string | null;
	defaultCwd: string;
	homeDir: string;
}

export function resolveCwd(input: CwdInputs): string {
	if (input.override && input.override.length > 0) return input.override;
	if (input.channelCwd && input.channelCwd.length > 0) return input.channelCwd;
	if (input.defaultCwd.length > 0) return input.defaultCwd;
	return input.homeDir;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/unit/cwd-resolver.test.ts
```

Expected: 5/5. 118/118 overall (was 113; +5).

- [ ] **Step 5: Commit**

```bash
git add src/shared/cwd-resolver.ts tests/unit/cwd-resolver.test.ts
git commit -m "feat(shared): cwd resolver"
```

---

### Task 5: AppSettingsRepo

**Files:**
- Create: `src/main/repos/app-settings.ts`
- Create: `tests/integration/app-settings-repo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/app-settings-repo.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";

let dir: string;
let db: DbHandle;
let repo: AppSettingsRepo;

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-app-settings-"));
	db = openDb({ filename: path.join(dir, "test.db") });
	runMigrations(db);
	repo = new AppSettingsRepo(db);
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("AppSettingsRepo", () => {
	it("getAll returns empty object when no settings stored", () => {
		expect(repo.getAll()).toEqual({});
	});

	it("set then getAll round-trips a string value", () => {
		repo.set("theme", "dark");
		expect(repo.getAll()).toEqual({ theme: "dark" });
	});

	it("set then getAll round-trips a number value", () => {
		repo.set("fontSize.sidebar", 16);
		expect(repo.getAll()).toEqual({ "fontSize.sidebar": 16 });
	});

	it("set overwrites the previous value", () => {
		repo.set("theme", "light");
		repo.set("theme", "dark");
		expect(repo.getAll()).toEqual({ theme: "dark" });
	});

	it("getAll surfaces multiple keys", () => {
		repo.set("theme", "light");
		repo.set("fontFamily", "Inter");
		repo.set("fontSize.sidebar", 16);
		expect(repo.getAll()).toEqual({
			theme: "light",
			fontFamily: "Inter",
			"fontSize.sidebar": 16,
		});
	});

	it("preserves null values", () => {
		repo.set("defaultCwd", null);
		expect(repo.getAll()).toEqual({ defaultCwd: null });
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/integration/app-settings-repo.test.ts
```

- [ ] **Step 3: Implement**

Create `src/main/repos/app-settings.ts`:

```ts
// Reads/writes app-level UI settings (theme, font, default cwd) in the
// settings_global table. Values are stored as JSON strings so anything
// JSON-serialisable round-trips. Distinct from settings/resolver.ts which
// scaffolds the (currently unused) pi-runtime cascade.

import type { DbHandle } from "../db/connection";

export class AppSettingsRepo {
	constructor(private readonly db: DbHandle) {}

	getAll(): Record<string, unknown> {
		const rows = this.db.raw
			.prepare("SELECT key, value FROM settings_global")
			.all() as unknown as Array<{ key: string; value: string }>;
		const out: Record<string, unknown> = {};
		for (const row of rows) {
			try {
				out[row.key] = JSON.parse(row.value) as unknown;
			} catch {
				out[row.key] = row.value;
			}
		}
		return out;
	}

	set(key: string, value: unknown): void {
		const json = JSON.stringify(value);
		this.db.raw
			.prepare(
				"INSERT INTO settings_global (key, value) VALUES (?, ?) " +
					"ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			)
			.run(key, json);
	}
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/integration/app-settings-repo.test.ts
npm run typecheck && npm run lint
```

Expected: 6/6 in this file. 124/124 overall (was 118; +6).

- [ ] **Step 5: Commit**

```bash
git add src/main/repos/app-settings.ts tests/integration/app-settings-repo.test.ts
git commit -m "feat(repo): AppSettingsRepo (settings_global)"
```

---

## Phase C — IPC

### Task 6: IPC types — settings + channels.setCwd + session.create cwd optional

**Files:**
- Modify: `src/shared/ipc-types.ts`

- [ ] **Step 1: Edit the registry**

In `src/shared/ipc-types.ts`:

(a) Replace the existing `"session.create"` entry with:

```ts
	"session.create": {
		req: { channelId: string; cwd?: string };
		res: { piSessionId: string };
	};
```

(b) Append (after `"session.findChannel"` if present, or at the end of `IpcMethods`):

```ts
	"settings.getAll": {
		req: Record<string, never>;
		res: { settings: Record<string, unknown> };
	};
	"settings.set": {
		req: { key: string; value: unknown };
		res: Record<string, never>;
	};
	"channels.setCwd": {
		req: { id: string; cwd: string | null };
		res: Record<string, never>;
	};
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
```

Both clean. (No new tests; handlers come next.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-types.ts
git commit -m "feat(ipc): types for settings.getAll/set + channels.setCwd; session.create cwd optional"
```

---

### Task 7: IPC — settings.getAll + settings.set handlers

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/integration/ipc-router.test.ts`

The router needs an `appSettings: AppSettingsRepo` dep. We'll add it to `RouterDeps`, instantiate in `index.ts`, and pass a fresh repo in tests.

- [ ] **Step 1: Write failing tests**

In `tests/integration/ipc-router.test.ts`, find the existing router construction in `beforeEach` and add `appSettings: new AppSettingsRepo(db)`:

```ts
	router = new IpcRouter({
		channels: new ChannelsRepo(db),
		channelSessions: new ChannelSessionsRepo(db),
		piSessionManager: piSessionManagerMock as unknown as PiSessionManager,
		appSettings: new AppSettingsRepo(db),
		dialog: { /* existing */ },
		getDefaultCwd: () => "/Users/test/home",
	});
```

Add the import at the top:

```ts
import { AppSettingsRepo } from "../../src/main/repos/app-settings";
```

Append inside the `describe("IpcRouter", ...)` block:

```ts
	it("settings.getAll returns the stored settings", async () => {
		const setR = await router.dispatch("settings.set", {
			key: "theme",
			value: "light",
		});
		expect(setR).toEqual({ ok: true, data: {} });

		const r = await router.dispatch("settings.getAll", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.settings).toEqual({ theme: "light" });
	});

	it("settings.set with a number round-trips", async () => {
		await router.dispatch("settings.set", {
			key: "fontSize.sidebar",
			value: 16,
		});
		const r = await router.dispatch("settings.getAll", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.settings["fontSize.sidebar"]).toBe(16);
	});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: TypeScript error about `appSettings` missing on `RouterDeps`, then `unknown_method` for the new methods.

- [ ] **Step 3: Wire RouterDeps**

In `src/main/ipc-router.ts`, add the import:

```ts
import type { AppSettingsRepo } from "./repos/app-settings";
```

Replace the `RouterDeps` interface with:

```ts
export interface RouterDeps {
	channels: ChannelsRepo;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: PiSessionManager;
	appSettings: AppSettingsRepo;
	dialog: DialogHandlers;
	getDefaultCwd: () => string;
}
```

Append inside the constructor's `this.register(...)` block:

```ts
		this.register("settings.getAll", async () => {
			return ok({ settings: this.deps.appSettings.getAll() });
		});
		this.register("settings.set", async (args) => {
			this.deps.appSettings.set(args.key, args.value);
			return ok({});
		});
```

- [ ] **Step 4: Wire main entry**

Edit `src/main/index.ts`. Add the import:

```ts
import { AppSettingsRepo } from "./repos/app-settings";
```

Inside `app.whenReady().then(() => { ... })`, after `const channelSessions = new ChannelSessionsRepo(db);`, add:

```ts
	const appSettings = new AppSettingsRepo(db);
```

Update the `IpcRouter` construction to pass it:

```ts
	router = new IpcRouter({
		channels,
		channelSessions,
		piSessionManager,
		appSettings,
		dialog: electronDialogHandlers,
		getDefaultCwd,
	});
```

- [ ] **Step 5: Run — expect PASS**

```bash
npm run test -- tests/integration/ipc-router.test.ts
npm run typecheck && npm run lint
npm run test
```

Expected: 126/126 (was 124; +2).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-router.ts src/main/index.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): settings.getAll + settings.set"
```

---

### Task 8: IPC — channels.setCwd handler

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Write failing tests**

Append inside `describe("IpcRouter", ...)`:

```ts
	it("channels.setCwd persists the cwd on the channel", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");

		const r = await router.dispatch("channels.setCwd", {
			id: c.data.id,
			cwd: "/Users/x/code",
		});
		expect(r).toEqual({ ok: true, data: {} });

		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		const ch = list.data.channels.find((x) => x.id === c.data.id);
		expect(ch?.cwd).toBe("/Users/x/code");
	});

	it("channels.setCwd with null clears the cwd", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		await router.dispatch("channels.setCwd", {
			id: c.data.id,
			cwd: "/Users/x",
		});
		await router.dispatch("channels.setCwd", { id: c.data.id, cwd: null });
		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		const ch = list.data.channels.find((x) => x.id === c.data.id);
		expect(ch?.cwd).toBeNull();
	});
```

This test relies on `channels.list` returning `cwd` as part of each channel — which `ChannelsRepo.list()` (Task 2) already provides. The IPC `channels.list` response shape needs to surface `cwd` too. Update the existing `channels.list` IpcMethods entry to include `cwd: string | null` if it doesn't already.

In `src/shared/ipc-types.ts`, find the existing `"channels.list"` entry. The current shape (from earlier plans) is roughly:

```ts
	"channels.list": {
		req: Record<string, never>;
		res: {
			channels: {
				id: string;
				name: string;
				position: number;
				icon: string | null;
				createdAt: number;
			}[];
		};
	};
```

Add `cwd: string | null;` inside the channels array element type:

```ts
	"channels.list": {
		req: Record<string, never>;
		res: {
			channels: {
				id: string;
				name: string;
				position: number;
				icon: string | null;
				cwd: string | null;
				createdAt: number;
			}[];
		};
	};
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/integration/ipc-router.test.ts
```

- [ ] **Step 3: Implement handler**

In `src/main/ipc-router.ts`, append inside the constructor's `this.register(...)` block:

```ts
		this.register("channels.setCwd", async (args) => {
			this.deps.channels.setCwd(args.id, args.cwd);
			return ok({});
		});
```

The existing `"channels.list"` handler already calls `this.deps.channels.list()`, which after Task 2 returns rows with `cwd`. No further changes there.

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/integration/ipc-router.test.ts
npm run typecheck && npm run lint
npm run test
```

Expected: 128/128 (was 126; +2).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts src/shared/ipc-types.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): channels.setCwd + channels.list returns cwd"
```

---

### Task 9: session.create resolves cwd from channel + defaultCwd; updated default-cwd.ts

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/default-cwd.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/integration/ipc-router.test.ts`

The `session.create` handler currently passes `args.cwd` straight to `piSessionManager.createSession`. We change it to resolve via `resolveCwd({override: args.cwd, channelCwd, defaultCwd, homeDir})` so the channel cwd or global default kicks in when the renderer doesn't pass one.

`default-cwd.ts` also changes: it now reads from `AppSettingsRepo.getAll().defaultCwd` (a string) and falls back to `os.homedir()`. We pass an `appSettings` ref to it.

- [ ] **Step 1: Write failing tests**

Append inside `describe("IpcRouter", ...)`:

```ts
	it("session.create resolves cwd from channel.cwd when override absent", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		await router.dispatch("channels.setCwd", {
			id: c.data.id,
			cwd: "/from-channel",
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/from-channel",
		});
	});

	it("session.create resolves cwd from defaultCwd when channel.cwd null", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/from-default",
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd2",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/from-default",
		});
	});

	it("session.create explicit override beats channel + default", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		await router.dispatch("channels.setCwd", {
			id: c.data.id,
			cwd: "/channel",
		});
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/default",
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd3",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/explicit",
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/explicit",
		});
	});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: the existing handler doesn't touch channel.cwd or defaultCwd, so calls receive `cwd: undefined` (or whatever the test passes) — fails.

- [ ] **Step 3: Update session.create handler**

In `src/main/ipc-router.ts`, add the import:

```ts
import { resolveCwd } from "../shared/cwd-resolver";
import { getDefaultCwd as readDefaultCwd } from "../shared/app-settings-keys";
```

Wait — `getDefaultCwd` already exists in `src/main/default-cwd.ts` as a plain function. Avoid the name collision by aliasing the shared one. Use:

```ts
import { resolveCwd } from "../shared/cwd-resolver";
import { getDefaultCwd as readDefaultCwdFromSettings } from "../shared/app-settings-keys";
```

Replace the existing `session.create` handler with:

```ts
		this.register("session.create", async (args) => {
			const channel = this.deps.channels.getById(args.channelId);
			if (!channel)
				return err("not_found", `channel ${args.channelId} not found`);

			const settings = this.deps.appSettings.getAll();
			const cwd = resolveCwd({
				override: args.cwd,
				channelCwd: channel.cwd,
				defaultCwd: readDefaultCwdFromSettings(settings),
				homeDir: this.deps.getDefaultCwd(),
			});

			const { piSessionId, sessionFilePath } =
				await this.deps.piSessionManager.createSession({ cwd });
			this.deps.channelSessions.attach({
				channelId: args.channelId,
				piSessionId,
				cwd,
				sessionFilePath,
			});
			return ok({ piSessionId });
		});
```

(Note: `getDefaultCwd` on the deps is now playing the `homeDir` role — it's the OS home directory in production. The naming is a bit confusing; we keep the name to avoid churn, but the dep is effectively the home-dir fallback.)

- [ ] **Step 4: Update src/main/default-cwd.ts**

Edit `src/main/default-cwd.ts`. The function currently returns `os.homedir()`. We're keeping it to mean exactly that — the OS home directory used as the final fallback. **Do not change `default-cwd.ts` in this task.** The settings-driven `defaultCwd` is read separately via `appSettings.getAll()` (see Step 3).

(The `settings.getDefaultCwd` IPC method also stays as-is for now: it returns `os.homedir()`. The renderer's `useDefaultCwd` hook continues to use it for the NewSessionForm placeholder. We'll re-route it in the next task.)

- [ ] **Step 5: Run — expect PASS**

```bash
npm run test -- tests/integration/ipc-router.test.ts
npm run typecheck && npm run lint
npm run test
```

Expected: 131/131 (was 128; +3).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): session.create resolves cwd from channel/default/home"
```

---

### Task 10: Re-route settings.getDefaultCwd through AppSettingsRepo

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/ipc-router.test.ts`

Make `settings.getDefaultCwd` return the user-configured `defaultCwd` (from `settings_global`) when present, otherwise the home directory.

- [ ] **Step 1: Write failing test**

Append inside `describe("IpcRouter", ...)`:

```ts
	it("settings.getDefaultCwd returns the user-set defaultCwd when present", async () => {
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/Users/x/configured",
		});

		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.cwd).toBe("/Users/x/configured");
	});

	it("settings.getDefaultCwd falls back to homeDir when defaultCwd unset", async () => {
		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.cwd).toBe("/Users/test/home");
	});
```

- [ ] **Step 2: Run — expect FAIL (or surprisingly pass on the home test)**

```bash
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: the configured-defaultCwd test fails (returns home unconditionally).

- [ ] **Step 3: Update the handler**

In `src/main/ipc-router.ts`, find the existing `settings.getDefaultCwd` handler and replace with:

```ts
		this.register("settings.getDefaultCwd", async () => {
			const settings = this.deps.appSettings.getAll();
			const configured = readDefaultCwdFromSettings(settings);
			return ok({ cwd: configured.length > 0 ? configured : this.deps.getDefaultCwd() });
		});
```

(The `readDefaultCwdFromSettings` import was added in Task 9.)

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- tests/integration/ipc-router.test.ts
```

Expected: 133/133 (was 131; +2).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-router.ts tests/integration/ipc-router.test.ts
git commit -m "feat(ipc): settings.getDefaultCwd reads from AppSettingsRepo"
```

---

## Phase D — Renderer hooks

### Task 11: queries.ts — useSettings, useSetSetting, useSetChannelCwd

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Append three hooks**

In `src/renderer/queries.ts`, append at the end:

```ts
export function useSettings() {
	return useQuery({
		queryKey: ["settings"],
		queryFn: () => invoke("settings.getAll", {}),
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
	});
}

export function useSetSetting() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { key: string; value: unknown }) =>
			invoke("settings.set", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
	});
}

export function useSetChannelCwd() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; cwd: string | null }) =>
			invoke("channels.setCwd", input),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
	});
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
npm run test
```

All clean. 133/133 still passing.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "feat(renderer): useSettings + useSetSetting + useSetChannelCwd"
```

---

## Phase E — Theme + font infrastructure

### Task 12: Tailwind class darkMode + semantic component classes

**Files:**
- Modify: `tailwind.config.cjs`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Update Tailwind config**

Replace `tailwind.config.cjs` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	darkMode: "class",
	theme: { extend: {} },
	plugins: [],
};
```

- [ ] **Step 2: Update styles.css**

Replace `src/renderer/styles.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
	height: 100%;
}
body {
	margin: 0;
	font-family: var(--font-family, ui-sans-serif), system-ui, sans-serif;
}

html {
	background: #ffffff;
	color: #18181b;
}
html.dark {
	background: #1a1a1f;
	color: #eeeeee;
}

@layer components {
	.surface-app {
		@apply bg-white dark:bg-[#1a1a1f];
	}
	.surface-panel {
		@apply bg-zinc-100 dark:bg-zinc-800;
	}
	.surface-row {
		@apply bg-zinc-200 dark:bg-zinc-700;
	}
	.surface-rail {
		@apply bg-zinc-100 dark:bg-[#1f1f24];
	}
	.text-primary {
		@apply text-zinc-900 dark:text-zinc-100;
	}
	.text-muted {
		@apply text-zinc-500 dark:text-zinc-400;
	}
	.text-faint {
		@apply text-zinc-400 dark:text-zinc-500;
	}
	.border-divider {
		@apply border-zinc-200 dark:border-zinc-800;
	}
}
```

(Setting `html.dark` background here ensures the body honours the theme even before React mounts the SettingsApplier.)

- [ ] **Step 3: Verify**

```bash
npm run typecheck
npm run lint
npm run test
```

Tests still green (no source-code change). 133/133.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.cjs src/renderer/styles.css
git commit -m "feat(theme): tailwind class darkMode + semantic component classes"
```

---

### Task 13: SettingsApplier component

**Files:**
- Create: `src/renderer/components/SettingsApplier.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/SettingsApplier.tsx`:

```tsx
// Mounts at the App root. Reads global settings via useSettings() and
// applies them to <html>:
//   - class="dark" toggle for theme
//   - CSS custom properties for font family + per-region sizes
// For theme="auto", subscribes to prefers-color-scheme and re-applies.

import React from "react";
import { useSettings } from "../queries";
import {
	type FontSizeRegion,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getTheme,
	type ThemeMode,
} from "../../shared/app-settings-keys";

const REGIONS: FontSizeRegion[] = [
	"sidebar",
	"chatAssistant",
	"chatUser",
	"composer",
	"codeBlock",
];

const REGION_VAR: Record<FontSizeRegion, string> = {
	sidebar: "--font-size-sidebar",
	chatAssistant: "--font-size-chat-assistant",
	chatUser: "--font-size-chat-user",
	composer: "--font-size-composer",
	codeBlock: "--font-size-code-block",
};

function effectiveTheme(mode: ThemeMode): "light" | "dark" {
	if (mode === "light") return "light";
	if (mode === "dark") return "dark";
	if (typeof window === "undefined" || !window.matchMedia) return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

export function SettingsApplier() {
	const { data } = useSettings();
	const settings = data?.settings ?? {};
	const theme = getTheme(settings);

	// Apply theme class.
	React.useEffect(() => {
		const apply = () => {
			const eff = effectiveTheme(theme);
			document.documentElement.classList.toggle("dark", eff === "dark");
		};
		apply();
		if (theme !== "auto" || !window.matchMedia) return;
		const mql = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => apply();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, [theme]);

	// Apply font family + sizes.
	React.useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty("--font-family", getFontFamily(settings));
		root.style.setProperty("--font-family-mono", getFontFamilyMono(settings));
		for (const region of REGIONS) {
			root.style.setProperty(
				REGION_VAR[region],
				`${getFontSize(settings, region)}px`,
			);
		}
	}, [settings]);

	return null;
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
npm run test
```

All clean. 133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsApplier.tsx
git commit -m "feat(theme): SettingsApplier writes class + CSS vars on <html>"
```

---

## Phase F — Settings UI components

### Task 14: SettingsDialog base shell

**Files:**
- Create: `src/renderer/components/SettingsDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/SettingsDialog.tsx`:

```tsx
// Reusable categorized modal. Left panel: list of categories. Right
// panel: the active category's component. Click outside or Escape closes.

import React from "react";

export interface SettingsCategory {
	id: string;
	label: string;
	render: () => React.ReactNode;
}

export interface SettingsDialogProps {
	open: boolean;
	title: string;
	categories: SettingsCategory[];
	onClose: () => void;
}

export function SettingsDialog({
	open,
	title,
	categories,
	onClose,
}: SettingsDialogProps) {
	const [activeId, setActiveId] = React.useState<string>(
		categories[0]?.id ?? "",
	);

	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;
	const active = categories.find((c) => c.id === activeId) ?? categories[0];
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape handled via keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel flex h-[80vh] w-[800px] overflow-hidden rounded shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<aside className="w-48 surface-app border-r border-divider p-3">
					<div className="mb-2 text-[10px] uppercase tracking-widest text-muted">
						{title}
					</div>
					{categories.map((cat) => (
						<button
							key={cat.id}
							type="button"
							onClick={() => setActiveId(cat.id)}
							className={`w-full rounded px-2 py-1 text-left text-sm ${
								activeId === cat.id
									? "surface-row text-primary"
									: "text-muted hover:surface-row"
							}`}
						>
							{cat.label}
						</button>
					))}
				</aside>
				<section className="flex-1 overflow-y-auto p-6 text-primary">
					{active?.render()}
				</section>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsDialog.tsx
git commit -m "feat(ui): SettingsDialog base shell"
```

---

### Task 15: ThemeSettings panel

**Files:**
- Create: `src/renderer/components/ThemeSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/ThemeSettings.tsx`:

```tsx
// Theme category: radio group for light / dark / auto.

import { useSettings, useSetSetting } from "../queries";
import { getTheme, type ThemeMode } from "../../shared/app-settings-keys";

const OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
	{
		value: "auto",
		label: "Auto",
		description: "Follow the operating system's appearance setting.",
	},
	{ value: "light", label: "Light", description: "Always use light mode." },
	{ value: "dark", label: "Dark", description: "Always use dark mode." },
];

export function ThemeSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const current = getTheme(data?.settings ?? {});

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-base font-semibold">Theme</h2>
			{OPTIONS.map((opt) => (
				<label
					key={opt.value}
					className={`flex cursor-pointer items-start gap-3 rounded border border-divider p-3 ${
						current === opt.value ? "surface-row" : ""
					}`}
				>
					<input
						type="radio"
						name="theme"
						value={opt.value}
						checked={current === opt.value}
						onChange={() =>
							setSetting.mutate({ key: "theme", value: opt.value })
						}
						className="mt-1"
					/>
					<div>
						<div className="text-sm font-medium">{opt.label}</div>
						<div className="text-xs text-muted">{opt.description}</div>
					</div>
				</label>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ThemeSettings.tsx
git commit -m "feat(ui): ThemeSettings panel"
```

---

### Task 16: FontSettings panel

**Files:**
- Create: `src/renderer/components/FontSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/FontSettings.tsx`:

```tsx
// Font category: UI family + monospace family (text input + curated
// dropdown), plus 5 per-region size sliders.

import React from "react";
import { useSettings, useSetSetting } from "../queries";
import {
	type FontSizeRegion,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
} from "../../shared/app-settings-keys";

const UI_FAMILIES = [
	"system-ui, -apple-system, sans-serif",
	'"Inter", system-ui, sans-serif',
	'"SF Pro Display", system-ui, sans-serif',
	'"Helvetica Neue", Helvetica, sans-serif',
	'Georgia, "Times New Roman", serif',
];

const MONO_FAMILIES = [
	"ui-monospace, SFMono-Regular, monospace",
	'"JetBrains Mono", ui-monospace, monospace',
	'"Fira Code", ui-monospace, monospace',
	'"Cascadia Code", ui-monospace, monospace',
	'"Menlo", ui-monospace, monospace',
];

const REGIONS: { id: FontSizeRegion; label: string }[] = [
	{ id: "sidebar", label: "Sidebar" },
	{ id: "chatAssistant", label: "Chat — assistant text" },
	{ id: "chatUser", label: "Chat — user message" },
	{ id: "composer", label: "Composer input" },
	{ id: "codeBlock", label: "Code blocks" },
];

const REGION_KEY: Record<FontSizeRegion, string> = {
	sidebar: "fontSize.sidebar",
	chatAssistant: "fontSize.chatAssistant",
	chatUser: "fontSize.chatUser",
	composer: "fontSize.composer",
	codeBlock: "fontSize.codeBlock",
};

const MIN_SIZE = 8;
const MAX_SIZE = 32;

export function FontSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const settings = data?.settings ?? {};

	return (
		<div className="flex flex-col gap-5">
			<h2 className="text-base font-semibold">Font</h2>

			<FamilyControl
				label="UI font family"
				value={getFontFamily(settings)}
				options={UI_FAMILIES}
				onChange={(v) => setSetting.mutate({ key: "fontFamily", value: v })}
			/>
			<FamilyControl
				label="Monospace font family"
				value={getFontFamilyMono(settings)}
				options={MONO_FAMILIES}
				onChange={(v) =>
					setSetting.mutate({ key: "fontFamilyMono", value: v })
				}
			/>

			<div>
				<div className="mb-2 text-sm font-medium">Sizes (px)</div>
				{REGIONS.map(({ id, label }) => {
					const size = getFontSize(settings, id);
					return (
						<div
							key={id}
							className="mb-2 flex items-center gap-3 text-sm"
						>
							<span className="w-44 text-muted">{label}</span>
							<input
								type="range"
								min={MIN_SIZE}
								max={MAX_SIZE}
								value={size}
								onChange={(e) =>
									setSetting.mutate({
										key: REGION_KEY[id],
										value: Number(e.target.value),
									})
								}
								className="flex-1"
							/>
							<span className="w-10 text-right tabular-nums">{size}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function FamilyControl({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) {
	const [text, setText] = React.useState(value);

	React.useEffect(() => {
		setText(value);
	}, [value]);

	return (
		<div className="flex flex-col gap-1">
			<div className="text-sm font-medium">{label}</div>
			<div className="flex gap-2">
				<select
					value={options.includes(value) ? value : ""}
					onChange={(e) => {
						if (e.target.value) {
							setText(e.target.value);
							onChange(e.target.value);
						}
					}}
					className="surface-row rounded px-2 py-1 text-sm"
				>
					<option value="">— pick —</option>
					{options.map((opt) => (
						<option key={opt} value={opt}>
							{opt.split(",")[0].replace(/"/g, "")}
						</option>
					))}
				</select>
				<input
					type="text"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onBlur={() => {
						if (text.trim() && text !== value) onChange(text.trim());
					}}
					className="flex-1 surface-row rounded px-2 py-1 text-sm"
					placeholder="custom font-family"
				/>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/FontSettings.tsx
git commit -m "feat(ui): FontSettings panel"
```

---

### Task 17: DefaultsSettings panel

**Files:**
- Create: `src/renderer/components/DefaultsSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/DefaultsSettings.tsx`:

```tsx
// Defaults category: default cwd field + 📁 picker. Stored in
// settings_global.defaultCwd; new channels with no cwd inherit it.

import React from "react";
import {
	useDefaultCwd,
	useOpenFolder,
	useSettings,
	useSetSetting,
} from "../queries";
import { getDefaultCwd } from "../../shared/app-settings-keys";

export function DefaultsSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const openFolder = useOpenFolder();
	const homeFallback = useDefaultCwd();
	const settings = data?.settings ?? {};
	const stored = getDefaultCwd(settings);
	const [draft, setDraft] = React.useState(stored);

	React.useEffect(() => {
		setDraft(stored);
	}, [stored]);

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: draft || undefined });
		if (r.path) {
			setDraft(r.path);
			setSetting.mutate({ key: "defaultCwd", value: r.path });
		}
	};

	const handleBlur = () => {
		const trimmed = draft.trim();
		if (trimmed !== stored) {
			setSetting.mutate({ key: "defaultCwd", value: trimmed });
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-base font-semibold">Defaults</h2>

			<div>
				<div className="mb-1 text-sm font-medium">Default cwd</div>
				<div className="mb-1 text-xs text-muted">
					New channels with no cwd inherit this. Sessions inherit the
					channel's cwd at creation.
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={handleBlur}
						placeholder={
							homeFallback.data ? homeFallback.data.cwd : "/"
						}
						className="flex-1 surface-row rounded px-2 py-1 text-sm"
					/>
					<button
						type="button"
						onClick={handleBrowse}
						title="Browse for folder"
						className="surface-row rounded px-2 hover:opacity-80"
					>
						📁
					</button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/DefaultsSettings.tsx
git commit -m "feat(ui): DefaultsSettings panel"
```

---

### Task 18: GlobalSettingsDialog wrapper

**Files:**
- Create: `src/renderer/components/GlobalSettingsDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/GlobalSettingsDialog.tsx`:

```tsx
// Global settings dialog: 3 categories — Theme, Font, Defaults.

import { DefaultsSettings } from "./DefaultsSettings";
import { FontSettings } from "./FontSettings";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeSettings } from "./ThemeSettings";

export interface GlobalSettingsDialogProps {
	open: boolean;
	onClose: () => void;
}

export function GlobalSettingsDialog({
	open,
	onClose,
}: GlobalSettingsDialogProps) {
	return (
		<SettingsDialog
			open={open}
			title="Settings"
			onClose={onClose}
			categories={[
				{ id: "theme", label: "Theme", render: () => <ThemeSettings /> },
				{ id: "font", label: "Font", render: () => <FontSettings /> },
				{
					id: "defaults",
					label: "Defaults",
					render: () => <DefaultsSettings />,
				},
			]}
		/>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/GlobalSettingsDialog.tsx
git commit -m "feat(ui): GlobalSettingsDialog (Theme / Font / Defaults)"
```

---

## Phase G — Channel settings

### Task 19: ChannelSettingsDialog

**Files:**
- Create: `src/renderer/components/ChannelSettingsDialog.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/ChannelSettingsDialog.tsx`:

```tsx
// Per-channel settings: name + cwd. Smaller modal, no categories.
// Save commits both fields. Empty cwd writes NULL (inherit global).

import React from "react";
import {
	useChannels,
	useDefaultCwd,
	useOpenFolder,
	useRenameChannel,
	useSetChannelCwd,
} from "../queries";

export interface ChannelSettingsDialogProps {
	channelId: string | null;
	onClose: () => void;
}

export function ChannelSettingsDialog({
	channelId,
	onClose,
}: ChannelSettingsDialogProps) {
	const channels = useChannels();
	const renameChannel = useRenameChannel();
	const setChannelCwd = useSetChannelCwd();
	const openFolder = useOpenFolder();
	const defaultCwd = useDefaultCwd();

	const channel = channels.data?.channels.find((c) => c.id === channelId);
	const [name, setName] = React.useState("");
	const [cwd, setCwd] = React.useState("");

	React.useEffect(() => {
		if (channel) {
			setName(channel.name);
			setCwd(channel.cwd ?? "");
		}
	}, [channel]);

	React.useEffect(() => {
		if (!channelId) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [channelId, onClose]);

	if (!channelId || !channel) return null;

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: cwd || undefined });
		if (r.path) setCwd(r.path);
	};

	const handleSave = async () => {
		const trimmedName = name.trim();
		if (trimmedName && trimmedName !== channel.name) {
			await renameChannel.mutateAsync({ id: channel.id, name: trimmedName });
		}
		const newCwd = cwd.trim();
		const targetCwd = newCwd === "" ? null : newCwd;
		if (targetCwd !== channel.cwd) {
			await setChannelCwd.mutateAsync({ id: channel.id, cwd: targetCwd });
		}
		onClose();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape handled via keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel w-96 rounded p-5 text-primary shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label="Channel settings"
			>
				<div className="mb-3 text-sm font-semibold">Channel settings</div>

				<label className="mb-3 block">
					<div className="mb-1 text-xs text-muted">Name</div>
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full surface-row rounded px-2 py-1 text-sm"
					/>
				</label>

				<label className="mb-1 block">
					<div className="mb-1 text-xs text-muted">cwd</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={cwd}
							onChange={(e) => setCwd(e.target.value)}
							placeholder={
								defaultCwd.data
									? `inherit global (${defaultCwd.data.cwd})`
									: "inherit global"
							}
							className="flex-1 surface-row rounded px-2 py-1 text-sm"
						/>
						<button
							type="button"
							onClick={handleBrowse}
							title="Browse for folder"
							className="surface-row rounded px-2 hover:opacity-80"
						>
							📁
						</button>
					</div>
				</label>
				<div className="mb-4 text-[11px] text-muted">
					Empty = inherit global default
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded surface-row px-3 py-1 text-xs hover:opacity-80"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChannelSettingsDialog.tsx
git commit -m "feat(ui): ChannelSettingsDialog (name + cwd)"
```

---

### Task 20: ModeRail gear icon + ChannelSidebar context menu + entry — wire dialogs in App

**Files:**
- Modify: `src/renderer/components/ModeRail.tsx`
- Modify: `src/renderer/components/ChannelSidebar.tsx`
- Modify: `src/renderer/App.tsx`

This task wires the entry points: the gear in the mode rail opens GlobalSettingsDialog; right-click on a channel + ⋮ "Settings…" both open ChannelSettingsDialog. State lifts up to App.

- [ ] **Step 1: Replace ModeRail with a clickable gear**

Replace `src/renderer/components/ModeRail.tsx` with:

```tsx
// Vertical icon rail on the far left. Top section: top-level mode
// switcher (only "chat" enabled in current scope). Bottom section:
// settings gear that opens the global settings dialog.

type Mode = "chat" | "skills" | "extensions" | "prompts";

const ICONS: Record<Mode, string> = {
	chat: "💬",
	skills: "🧩",
	extensions: "🧪",
	prompts: "📜",
};

export function ModeRail({
	mode,
	onSelect,
	onOpenSettings,
}: {
	mode: Mode;
	onSelect: (m: Mode) => void;
	onOpenSettings: () => void;
}) {
	const items: { mode: Mode; enabled: boolean }[] = [
		{ mode: "chat", enabled: true },
		{ mode: "skills", enabled: false },
		{ mode: "extensions", enabled: false },
		{ mode: "prompts", enabled: false },
	];
	return (
		<div className="flex w-12 flex-col items-center gap-2 surface-rail py-2 text-primary">
			{items.map((it) => (
				<button
					key={it.mode}
					type="button"
					disabled={!it.enabled}
					onClick={() => {
						if (it.enabled) onSelect(it.mode);
					}}
					className={`h-8 w-8 rounded-md text-base transition disabled:opacity-30 ${
						mode === it.mode
							? "bg-indigo-600 text-white"
							: "surface-row hover:opacity-80"
					}`}
					title={it.mode}
				>
					{ICONS[it.mode]}
				</button>
			))}
			<div className="mt-auto" />
			<button
				type="button"
				onClick={onOpenSettings}
				className="h-8 w-8 rounded-md text-base surface-row hover:opacity-80"
				title="Settings"
				aria-label="Open settings"
			>
				⚙️
			</button>
		</div>
	);
}

export type { Mode };
```

- [ ] **Step 2: Add `onChannelSettings` callback to ChannelSidebar + context menu + ⋮ entry**

In `src/renderer/components/ChannelSidebar.tsx`:

(a) Extend the props with `onOpenChannelSettings`:

```tsx
export function ChannelSidebar({
	selectedChannelId,
	selectedSessionId,
	onSelectChannel,
	onSelectSession,
	onOpenChannelSettings,
}: {
	selectedChannelId: string | null;
	selectedSessionId: string | null;
	onSelectChannel: (id: string | null) => void;
	onSelectSession: (id: string | null) => void;
	onOpenChannelSettings: (channelId: string) => void;
}) {
```

(b) Find the channel-row rendering block (the `<div key={c.id} ...>` inside `channels.data?.channels.map`). Add an `onContextMenu` handler at the **outer** `<div>`:

Replace:

```tsx
				<div
					key={c.id}
					className={`group flex items-center gap-1 rounded ${
						selectedChannelId === c.id
							? "bg-zinc-700 text-white"
							: "text-zinc-400 hover:bg-zinc-800"
					}`}
				>
```

with:

```tsx
				<div
					key={c.id}
					className={`group flex items-center gap-1 rounded ${
						selectedChannelId === c.id
							? "bg-zinc-700 text-white"
							: "text-zinc-400 hover:bg-zinc-800"
					}`}
					onContextMenu={(e) => {
						e.preventDefault();
						onOpenChannelSettings(c.id);
					}}
				>
```

(c) In the same block's `<RowMenu items={[...]} />`, insert a "Settings…" entry between Rename and Delete:

```tsx
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
									label: "Settings…",
									onClick: () => onOpenChannelSettings(c.id),
								},
								{
									label: "Delete",
									destructive: true,
									onClick: () => handleRequestDeleteChannel(c.id, c.name),
								},
							]}
						/>
```

- [ ] **Step 3: Wire App.tsx — state + dialogs + SettingsApplier**

Replace `src/renderer/App.tsx` with:

```tsx
// Root application component that composes the three-pane shell:
// ModeRail | ChannelSidebar | ChatPane | BranchPanel.
// Hosts SettingsApplier (writes class+CSS vars on <html>) and the two
// settings dialog state slots.

import React from "react";
import { BranchPanel } from "./components/BranchPanel";
import { ChannelSettingsDialog } from "./components/ChannelSettingsDialog";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ChatPane } from "./components/ChatPane";
import { GlobalSettingsDialog } from "./components/GlobalSettingsDialog";
import { type Mode, ModeRail } from "./components/ModeRail";
import { SettingsApplier } from "./components/SettingsApplier";

export function App() {
	const [mode, setMode] = React.useState<Mode>("chat");
	const [channelId, setChannelId] = React.useState<string | null>(null);
	const [sessionId, setSessionId] = React.useState<string | null>(null);
	const [globalSettingsOpen, setGlobalSettingsOpen] = React.useState(false);
	const [channelSettingsTarget, setChannelSettingsTarget] = React.useState<
		string | null
	>(null);

	return (
		<>
			<SettingsApplier />
			<div className="flex h-full surface-app">
				<ModeRail
					mode={mode}
					onSelect={setMode}
					onOpenSettings={() => setGlobalSettingsOpen(true)}
				/>
				<ChannelSidebar
					selectedChannelId={channelId}
					selectedSessionId={sessionId}
					onSelectChannel={(id) => {
						setChannelId(id);
						setSessionId(null);
					}}
					onSelectSession={setSessionId}
					onOpenChannelSettings={setChannelSettingsTarget}
				/>
				<ChatPane piSessionId={sessionId} />
				<BranchPanel />
			</div>
			<GlobalSettingsDialog
				open={globalSettingsOpen}
				onClose={() => setGlobalSettingsOpen(false)}
			/>
			<ChannelSettingsDialog
				channelId={channelSettingsTarget}
				onClose={() => setChannelSettingsTarget(null)}
			/>
		</>
	);
}
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ModeRail.tsx src/renderer/components/ChannelSidebar.tsx src/renderer/App.tsx
git commit -m "feat(ui): wire global + channel settings entry points"
```

---

### Task 21: NewSessionForm pre-fill from channel cwd

**Files:**
- Modify: `src/renderer/components/NewSessionForm.tsx`
- Modify: `src/renderer/components/ChannelSidebar.tsx`

The form currently seeds cwd from localStorage > settings.getDefaultCwd. We change it to: channel.cwd > localStorage > settings.getDefaultCwd. ChannelSidebar passes the channel cwd in.

- [ ] **Step 1: Update NewSessionForm**

Replace `src/renderer/components/NewSessionForm.tsx` with:

```tsx
// Inline form for creating a session: cwd text input + 📁 picker + Create.
// Cwd seed priority: explicit channel cwd → last-used (localStorage) →
// global settings.getDefaultCwd. Empty input falls back to channel cwd
// at session creation (resolved server-side).

import React from "react";
import { useDefaultCwd, useOpenFolder } from "../queries";

const LAST_CWD_KEY = "macpi.lastCwd";

export interface NewSessionFormProps {
	channelCwd: string | null;
	pending: boolean;
	error: string | null;
	onSubmit: (cwd: string) => void;
}

export function NewSessionForm({
	channelCwd,
	pending,
	error,
	onSubmit,
}: NewSessionFormProps) {
	const defaultCwd = useDefaultCwd();
	const openFolder = useOpenFolder();
	const [cwd, setCwd] = React.useState<string>("");
	const seededRef = React.useRef(false);

	React.useEffect(() => {
		if (seededRef.current) return;
		if (channelCwd) {
			setCwd(channelCwd);
			seededRef.current = true;
			return;
		}
		const last = window.localStorage.getItem(LAST_CWD_KEY);
		if (last) {
			setCwd(last);
			seededRef.current = true;
			return;
		}
		if (defaultCwd.data?.cwd) {
			setCwd(defaultCwd.data.cwd);
			seededRef.current = true;
		}
	}, [channelCwd, defaultCwd.data]);

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
					className="flex-1 surface-row rounded px-2 py-1 text-xs text-primary placeholder-faint outline-none"
					title={cwd}
				/>
				<button
					type="button"
					onClick={handleBrowse}
					title="Browse for folder"
					className="surface-row rounded px-1.5 py-0.5 text-xs hover:opacity-80"
				>
					📁
				</button>
			</div>
			<button
				type="submit"
				disabled={pending || !cwd.trim()}
				className="surface-row rounded px-2 py-1 text-xs hover:opacity-80 disabled:opacity-50"
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

- [ ] **Step 2: Pass channelCwd into NewSessionForm in ChannelSidebar**

In `src/renderer/components/ChannelSidebar.tsx`, find the existing `<NewSessionForm ... />` usage and update it. Just before that, derive the selected channel:

```tsx
	const selectedChannel = channels.data?.channels.find(
		(c) => c.id === selectedChannelId,
	);
```

Then update the JSX:

```tsx
					<NewSessionForm
						channelCwd={selectedChannel?.cwd ?? null}
						pending={createSession.isPending}
						error={
							createSession.error ? createSession.error.message : null
						}
						onSubmit={handleCreateSession}
					/>
```

(`handleCreateSession` already exists from the previous plan and currently passes `cwd` straight to `createSession.mutateAsync`. With Task 9, `session.create` resolves cwd server-side if the renderer omits it — but the existing handler still passes `cwd`, which is the explicit override. This is the correct behaviour for the "advanced override" UX.)

- [ ] **Step 3: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

133/133.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/NewSessionForm.tsx src/renderer/components/ChannelSidebar.tsx
git commit -m "feat(ui): NewSessionForm seeds cwd from channel.cwd"
```

---

## Phase H — Theme sweep

### Task 22: Convert hardcoded colors to semantic classes

**Files (all modify):**
- `src/renderer/components/ChannelSidebar.tsx`
- `src/renderer/components/ChatPane.tsx`
- `src/renderer/components/Composer.tsx`
- `src/renderer/components/Timeline.tsx`
- `src/renderer/components/BranchPanel.tsx`
- `src/renderer/components/ModeRail.tsx` (already done in Task 20)
- `src/renderer/components/BreadcrumbBar.tsx`
- `src/renderer/components/ConfirmDialog.tsx`
- `src/renderer/components/RowMenu.tsx`
- `src/renderer/components/SessionRow.tsx`
- `src/renderer/components/banners/QueuePills.tsx`
- `src/renderer/components/banners/CompactionBanner.tsx`
- `src/renderer/components/banners/RetryBanner.tsx`
- `src/renderer/components/messages/UserBlock.tsx` (or whichever exist — check)
- `src/renderer/components/messages/AssistantBlock.tsx`
- `src/renderer/components/messages/ToolBlock.tsx`
- `src/renderer/components/messages/ThinkingBlock.tsx`

This is a mechanical sweep. Apply the following replacements **only on Tailwind class strings** (don't touch JSX text content):

| Find | Replace |
|---|---|
| `bg-[#1a1a1f]` | `surface-app` |
| `bg-zinc-900` | `surface-app` |
| `bg-[#26262b]` | `surface-panel` |
| `bg-zinc-800` (when used as a panel/container background) | `surface-panel` |
| `bg-zinc-800` (when used as a row hover) | leave or replace with `hover:surface-row` per context |
| `bg-zinc-700` (selected row, button bg) | `surface-row` |
| `text-zinc-200` | `text-primary` |
| `text-zinc-300` | `text-primary` |
| `text-zinc-100` | `text-primary` |
| `text-zinc-500` | `text-muted` |
| `text-zinc-400` | `text-muted` |
| `text-zinc-600` (existing in BreadcrumbBar) | `text-faint` |
| `border-zinc-800` | `border-divider` |
| `placeholder-zinc-500` | `placeholder-faint` |

**Do NOT replace:**
- Affordance colors: `bg-red-600`, `bg-red-900/40`, `text-red-200`, `text-red-300`
- Queue/steer/retry: `bg-indigo-600`, `bg-indigo-900/60`, `bg-amber-*`
- Selection accent: `bg-indigo-600 text-white` for active mode rail item

For each file, read it, apply the substitutions, save. Then verify visually in the smoke step that nothing went weird.

- [ ] **Step 1: Apply substitutions to all listed files**

For each file, run a find-and-replace using the table above. Be careful to replace whole class names (not partial matches inside other classes).

A helpful sanity check: after each file, look at the diff and confirm only Tailwind class strings changed.

- [ ] **Step 2: Verify**

```bash
npm run typecheck
npm run lint
npm run test
```

All clean. 133/133. The build still works in dark mode (we're now reaching for the same dark colours via the `dark:` variants in `surface-*` classes).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/
git commit -m "refactor(theme): replace hardcoded colors with surface-* / text-* / border-* classes"
```

---

### Task 23: Apply CSS font-size vars to key regions

**Files (all modify):**
- `src/renderer/components/ChannelSidebar.tsx`
- `src/renderer/components/SessionRow.tsx`
- `src/renderer/components/Timeline.tsx` (or wherever assistant text renders)
- `src/renderer/components/messages/AssistantBlock.tsx` (if separate)
- `src/renderer/components/messages/UserBlock.tsx` (if separate)
- `src/renderer/components/Composer.tsx`
- `src/renderer/components/messages/ToolBlock.tsx` (code block region)

The font-size vars are written by SettingsApplier as `--font-size-sidebar` etc. We apply them with Tailwind arbitrary values: `text-[length:var(--font-size-sidebar)]`.

Region-to-class mapping:

| Region | CSS var | Tailwind |
|---|---|---|
| Sidebar (channels + sessions) | `--font-size-sidebar` | `text-[length:var(--font-size-sidebar)]` |
| Chat assistant text | `--font-size-chat-assistant` | `text-[length:var(--font-size-chat-assistant)]` |
| Chat user message | `--font-size-chat-user` | `text-[length:var(--font-size-chat-user)]` |
| Composer input | `--font-size-composer` | `text-[length:var(--font-size-composer)]` |
| Code blocks (in ToolBlock or wherever) | `--font-size-code-block` | `text-[length:var(--font-size-code-block)]` |

- [ ] **Step 1: Apply**

For the sidebar root container (the outer `<div className="flex w-60 ...">` in ChannelSidebar), add `text-[length:var(--font-size-sidebar)]` to the className.

For Composer's main `<textarea>` or `<input>`, add `text-[length:var(--font-size-composer)]`.

For each message component's main content text (assistant/user/tool/code), add the corresponding class to the wrapping element.

For code-display areas (typically a `<pre>` or syntax-highlighted block in ToolBlock): use `text-[length:var(--font-size-code-block)] font-[family-name:var(--font-family-mono)]`.

For UI font family at the top level: in `App.tsx`'s outer `<div className="flex h-full surface-app">`, add `font-[family-name:var(--font-family)]`.

- [ ] **Step 2: Verify**

```bash
npm run typecheck && npm run lint && npm run test
```

All clean. 133/133.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/
git commit -m "feat(theme): wire font-size CSS vars to chat / sidebar / composer / code"
```

---

## Phase I — Final gates + smoke

### Task 24: Final gates + manual smoke

**Files:** none

- [ ] **Step 1: Run full quality gates**

```bash
npm run typecheck
npm run lint
npm run test
```

All green; expect 133/133 (was 97 before this plan).

- [ ] **Step 2: Manual smoke test**

Run the dev app:

```bash
npm start
```

Walk through:

1. App launches with default theme (auto follows OS), default fonts, default cwd = `os.homedir()`.
2. Click ⚙️ in mode rail → Global Settings opens.
3. **Theme**: switch to Light → entire UI re-themes; switch to Dark → switches back; switch to Auto → matches OS.
4. **Font**: pick Inter from UI dropdown → font changes app-wide. Slide Sidebar size to 16 → sidebar text grows. Slide Composer to 16 → composer grows.
5. **Defaults**: type a path or use 📁 picker → "Default cwd" updates.
6. Close dialog. Create a new channel — its cwd inherits the global default (visible in NewSessionForm cwd input).
7. Right-click on a channel → ChannelSettingsDialog opens (no native browser context menu).
8. Set channel name + cwd. Save. Sidebar updates. New sessions in this channel use that cwd by default.
9. ⋮ on a channel → "Settings…" entry → same dialog opens.
10. Restart the app → all settings persist; theme reapplies before React mounts (initial paint).

- [ ] **Step 3: If smoke uncovers issues, file follow-up tasks** — surface them rather than silently fixing.

---

## Self-review

**Spec coverage:**
- §2 Goal 1 (single source of truth for global prefs) → Tasks 5, 7, 11, 13, 14, 18.
- §2 Goal 2 (per-channel cwd dialog) → Tasks 1, 2, 8, 19, 20.
- §2 Goal 3 (full light + dark + auto) → Tasks 12, 13, 22.
- §2 Goal 4 (per-region font sizing) → Tasks 13, 16, 23.
- §2 Goal 5 (NewSessionForm preserved as advanced override) → Task 21.
- §5.1 migration shape → Task 1.
- §5.2 settings keys (9) → Tasks 3, 5 (storage), 14-18 (UI).
- §5.3 cwd resolution → Tasks 4, 9.
- §6.1 new IPC methods → Tasks 6, 7, 8.
- §6.2 modified IPC methods → Tasks 6, 9, 10.
- §7 components → Tasks 13-21.
- §8 hooks → Task 11.
- §9 theme infrastructure → Tasks 12, 13.
- §10 curated font lists → Task 16.
- §11 channel dialog → Tasks 19, 20.
- §13 testing → covered: L1 unit (3, 4), L2 integration (2, 5, 7, 8, 9, 10).

**Placeholder scan:** Task 22 lists "messages/UserBlock.tsx (or whichever exist — check)" — that's a known fuzziness because I don't have a confirmed file list for the messages/ subdirectory in this worktree. The implementer should `ls src/renderer/components/messages/` before sweeping that subdir. Acceptable.

**Type consistency:**
- `ThemeMode` defined in Task 3 used in Tasks 13, 15.
- `FontSizeRegion` defined in Task 3 used in Tasks 13, 16.
- `Channel.cwd` added in Task 2 used in Tasks 8, 19, 21.
- `AppSettingsKey` defined in Task 3 — matches the keys written in Tasks 14-18.
- IPC method names match across types (Task 6) and handlers (Tasks 7-10).

**Note on Tailwind class darkMode:** Switching to `darkMode: "class"` should be no-op for production users until SettingsApplier toggles `class="dark"`. The default body bg is set in styles.css (`html` light, `html.dark` dark) so initial paint matches the user's stored preference once SettingsApplier writes the class — though there's a brief flash on first load (typical for client-side theming). Mitigation deferred (would require persisting theme preference outside the React tree, e.g. a small init script in `index.html`).
