# macpi Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the macpi foundation milestone — an Electron app where the user can create a channel, start a pi session, type a prompt, and watch streaming text from pi (using their existing Codex auth via `@earendil-works/pi-coding-agent`).

**Architecture:** Three-process Electron app — renderer (React, no Node), main (Electron, owns SQLite + IPC), pi-host (`utilityProcess` that imports the pi-coding-agent SDK). Renderer ↔ main via `contextBridge`; main ↔ pi-host via `MessageChannelMain`. Persistence is a single SQLite file in `app.getPath('userData')` via `better-sqlite3`.

**Tech Stack:** Electron Forge + Vite + TypeScript (template `vite-typescript`); React 18 + TanStack Query + Tailwind CSS; `@earendil-works/pi-coding-agent ^0.74`; `better-sqlite3`; Vitest for unit/integration tests; Biome for lint/format.

**Out of scope for this plan (lands in later plans):** tool blocks, branch UI, thinking blocks, retry/compaction banners, settings UI, management surfaces (skills/extensions/prompts), CodeMirror editor, error-recovery modals, packaging, E2E.

**Reference:** Spec at `docs/superpowers/specs/2026-05-09-macpi-pi-dev-ui-design.md`.

---

## File structure created by this plan

```
macpi/
├── Makefile                                # setup/build/run/test/deploy
├── package.json                            # workspace root, electron-forge config
├── tsconfig.json                           # base TS config
├── biome.json                              # lint/format
├── vitest.config.ts                        # test config (jsdom for renderer-pure, node for main)
├── forge.config.ts                         # Electron Forge config
├── vite.main.config.ts                     # main bundle vite config
├── vite.renderer.config.ts                 # renderer bundle vite config
├── vite.preload.config.ts                  # preload bundle vite config
├── vite.pi-host.config.ts                  # pi-host bundle vite config
├── src/
│   ├── shared/
│   │   ├── ipc-types.ts                    # IPC envelope + method registry
│   │   ├── settings-keys.ts                # cascade key types + defaults
│   │   └── pi-host-protocol.ts             # main↔pi-host message types
│   ├── main/
│   │   ├── index.ts                        # Electron main entry
│   │   ├── window.ts                       # window creation + lifecycle
│   │   ├── ipc-router.ts                   # contextBridge router (renderer ↔ main)
│   │   ├── pi-host-manager.ts              # spawn / supervise pi-host
│   │   ├── db/
│   │   │   ├── connection.ts               # better-sqlite3 wrapper
│   │   │   ├── migrations.ts               # migration runner
│   │   │   └── migrations/
│   │   │       └── 0001-init.sql           # initial schema
│   │   ├── repos/
│   │   │   ├── channels.ts                 # channels CRUD
│   │   │   └── channel-sessions.ts         # channel↔pi_session_id mapping
│   │   └── settings/
│   │       └── resolver.ts                 # cascade resolver (pure)
│   ├── pi-host/
│   │   ├── index.ts                        # utilityProcess entry; protocol handler
│   │   └── session-manager.ts              # owns AgentSession instances
│   ├── preload/
│   │   └── index.ts                        # contextBridge surface
│   └── renderer/
│       ├── index.html                      # HTML shell
│       ├── main.tsx                        # React entry
│       ├── App.tsx                         # three-pane shell (chat-only for foundation)
│       ├── ipc.ts                          # typed wrappers around window.macpi
│       ├── queries.ts                      # TanStack Query hooks
│       ├── components/
│       │   ├── ModeRail.tsx                # left rail (chat-only enabled in foundation)
│       │   ├── ChannelSidebar.tsx          # channels + sessions list
│       │   ├── ChatPane.tsx                # message list + composer
│       │   └── BranchPanel.tsx             # placeholder in foundation; wired in plan 2
│       └── styles.css                      # Tailwind entry
└── tests/
    ├── unit/                               # Vitest layer 1
    │   ├── ipc-envelope.test.ts
    │   ├── migrations.test.ts
    │   └── settings-resolver.test.ts
    └── integration/                        # Vitest layer 2 (real SQLite, mocked pi-host)
        ├── channels-repo.test.ts
        └── ipc-router.test.ts
# (pi-integration tests — Layer 3 — land in plan 2 with the full event surface)
```

---

## Conventions for this plan

- **TDD per feature**: failing test → minimal code → passing test → commit. Where TDD doesn't apply (e.g. boilerplate scaffold), the plan says so explicitly.
- **Commit messages** use conventional commit prefixes: `chore:`, `feat:`, `test:`, `fix:`, `docs:`, `build:`. The scope (in parentheses) names the area.
- **All commands run from the project root** (`/Users/roaanv/mycode/macpi`) unless stated otherwise.
- **`npm` is the package manager** (matches pi's monorepo). Don't introduce `pnpm`/`bun`.
- **Don't mark a task complete** until its tests pass and the commit is made.

---

## Phase A — Scaffold

### Task 1: Initialize Electron Forge with Vite + TypeScript template

**Files:**
- Create: `package.json`, `tsconfig.json`, `forge.config.ts`, `vite.main.config.ts`, `vite.renderer.config.ts`, `vite.preload.config.ts`, `src/main.ts` (template default), `src/preload.ts` (template default), `src/renderer.ts` (template default), `index.html`
- Note: the template puts the entry at `src/main.ts` etc. We will reorganize in Task 6 — keep template defaults for this task to confirm the scaffold runs.

- [ ] **Step 1: Confirm working directory is empty of code**

```bash
ls /Users/roaanv/mycode/macpi
# Expected output: .git, .gitignore, .superpowers, README.md, docs
```

If anything else is present, stop and ask the user.

- [ ] **Step 2: Initialize the Electron Forge project**

The template wants to create a new directory; we want it in-place. Run:

```bash
cd /Users/roaanv/mycode/macpi && npx --yes create-electron-app@latest . --template=vite-typescript
```

If `create-electron-app` refuses to write to a non-empty directory, instead initialize in `/tmp` and copy the relevant files in:

```bash
cd /tmp && rm -rf macpi-scaffold && npx --yes create-electron-app@latest macpi-scaffold --template=vite-typescript
rsync -a --exclude='.git' --exclude='.gitignore' /tmp/macpi-scaffold/ /Users/roaanv/mycode/macpi/
```

Merge the template's `.gitignore` lines into our existing `.gitignore` (do not overwrite — we already have entries for `.superpowers/`):

```bash
cat /tmp/macpi-scaffold/.gitignore >> /Users/roaanv/mycode/macpi/.gitignore
sort -u /Users/roaanv/mycode/macpi/.gitignore -o /Users/roaanv/mycode/macpi/.gitignore
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/roaanv/mycode/macpi && npm install
```

- [ ] **Step 4: Verify the scaffold launches**

```bash
cd /Users/roaanv/mycode/macpi && npm start
```

Expected: an Electron window opens with a "Hello World" page. Close the window when verified.

- [ ] **Step 5: Set the app product name and bundle id in `forge.config.ts`**

Open `forge.config.ts`. Locate the `packagerConfig` block and set:

```ts
packagerConfig: {
  name: "macpi",
  appBundleId: "io.0112.macpi",
  appCategoryType: "public.app-category.developer-tools",
  asar: true,
},
```

(Other fields the template generated stay as-is.)

- [ ] **Step 6: Set the package.json name**

Open `package.json`. Set:

```json
"name": "macpi",
"productName": "macpi",
"description": "Electron UI for the pi.dev coding agent",
"author": "roaanv <roaanv@0112.io>",
"license": "MIT"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(scaffold): initialize Electron Forge with Vite + TypeScript template"
```

---

### Task 2: Add Biome, Tailwind, React, TanStack Query, and Vitest

**Files:**
- Create: `biome.json`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`
- Modify: `package.json` (add deps + scripts), `src/renderer.ts` → renamed in Task 6

- [ ] **Step 1: Install dev dependencies**

```bash
cd /Users/roaanv/mycode/macpi && npm install --save-dev \
  @biomejs/biome@^2.3.5 \
  vitest@^3.2.4 \
  @vitest/coverage-v8@^3.2.4 \
  jsdom@^25 \
  @types/react@^18 \
  @types/react-dom@^18 \
  tailwindcss@^3.4 \
  postcss@^8 \
  autoprefixer@^10
```

(Pinning Tailwind to v3 — v4 is still beta and the app shell isn't a place we want to debug Tailwind itself.)

- [ ] **Step 2: Install runtime dependencies**

```bash
cd /Users/roaanv/mycode/macpi && npm install \
  react@^18 react-dom@^18 \
  @tanstack/react-query@^5
```

- [ ] **Step 3: Initialize Tailwind**

```bash
cd /Users/roaanv/mycode/macpi && npx tailwindcss init -p
```

Open `tailwind.config.js` and set:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.5/schema.json",
  "files": { "ignore": ["dist", "out", "node_modules", ".vite"] },
  "formatter": { "enabled": true, "indentStyle": "tab" },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "organizeImports": { "enabled": true }
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

- [ ] **Step 6: Add scripts to `package.json`**

Inside the existing `"scripts"` block, add (keep existing scripts):

```json
"lint": "biome check --error-on-warnings .",
"format": "biome check --write .",
"test": "vitest --run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 7: Run lint and confirm clean**

```bash
cd /Users/roaanv/mycode/macpi && npm run format
npm run lint
```

Expected: lint passes (after the format pass auto-fixes anything trivial).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(deps): add Biome, Tailwind, React, TanStack Query, Vitest"
```

---

### Task 3: Add a Makefile with the targets the project requires

**Files:**
- Create: `Makefile`

The user's CLAUDE.md mandates `setup`, `build`, `run`, `deploy` targets and that `make build` and `make run` are the canonical commands.

- [ ] **Step 1: Write `Makefile`**

```makefile
# macpi — top-level Makefile.
# Canonical commands per project conventions: `make build`, `make run`.

.PHONY: setup build run test test-all lint format typecheck clean deploy

setup:
	npm install

build:
	npm run package

run:
	npm start

test:
	npm test

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

clean:
	rm -rf out .vite dist node_modules/.cache

deploy:
	# Packaging + DMG creation lands in plan 5. Until then this is a placeholder
	# that fails loudly so it can never be confused with a real release.
	@echo "deploy: not implemented in foundation milestone (lands in plan 5)" && exit 1
```

- [ ] **Step 2: Verify make targets work**

```bash
cd /Users/roaanv/mycode/macpi && make typecheck && make lint && make test
```

Expected: typecheck passes (no source files yet beyond the template), lint passes, tests pass with "no test files found" but exit 0 (vitest with no matches passes by default — confirm; if not, add a placeholder test in Task 4).

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "build(make): add setup/build/run/test/lint/typecheck targets"
```

---

## Phase B — Project layout & shared types

### Task 4: Reorganize source layout under `src/main/`, `src/preload/`, `src/renderer/`, `src/pi-host/`, `src/shared/`

The Forge Vite TS template puts everything at `src/main.ts`, `src/preload.ts`, `src/renderer.ts`. Our spec needs four bundles. We move now while the code is still trivial.

**Files:**
- Modify: `forge.config.ts`, `vite.main.config.ts`, `vite.renderer.config.ts`, `vite.preload.config.ts`, `package.json`
- Create: `vite.pi-host.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/main.tsx`, `src/renderer/index.html`, `src/renderer/styles.css`, `src/pi-host/index.ts`, `src/shared/.gitkeep`
- Delete: `src/main.ts`, `src/preload.ts`, `src/renderer.ts`, `index.html`

- [ ] **Step 1: Move template files into the new layout**

```bash
cd /Users/roaanv/mycode/macpi
mkdir -p src/main src/preload src/renderer src/pi-host src/shared
git mv src/main.ts src/main/index.ts
git mv src/preload.ts src/preload/index.ts
mv src/renderer.ts src/renderer/main.tsx
git add -A
git mv index.html src/renderer/index.html
```

- [ ] **Step 2: Create the renderer's CSS entry**

Create `src/renderer/styles.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { margin: 0; background: #1a1a1f; color: #eee; font-family: ui-sans-serif, system-ui, sans-serif; }
```

- [ ] **Step 3: Replace `src/renderer/main.tsx` with a React entry**

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";

const queryClient = new QueryClient();

function App() {
  return <div className="p-4">macpi — foundation milestone</div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 4: Update `src/renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>macpi</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Update `forge.config.ts` plugin entry paths**

In `forge.config.ts`, find the `VitePlugin` config and update the `build` entries. Replace the existing entries with:

```ts
{
  entry: "src/main/index.ts",
  config: "vite.main.config.ts",
  target: "main",
},
{
  entry: "src/preload/index.ts",
  config: "vite.preload.config.ts",
  target: "preload",
},
{
  entry: "src/pi-host/index.ts",
  config: "vite.pi-host.config.ts",
  target: "main", // pi-host bundles like main: Node CommonJS, no Electron globals
},
```

And the `renderer` array entry:

```ts
renderer: [
  {
    name: "main_window",
    config: "vite.renderer.config.ts",
  },
],
```

- [ ] **Step 6: Update `vite.renderer.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
});
```

Install the React plugin:

```bash
cd /Users/roaanv/mycode/macpi && npm install --save-dev @vitejs/plugin-react
```

- [ ] **Step 7: Create `vite.pi-host.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/pi-host/index.ts",
      formats: ["cjs"],
      fileName: () => "pi-host.js",
    },
    rollupOptions: {
      external: ["electron", /^node:/, "@earendil-works/pi-coding-agent"],
    },
  },
});
```

- [ ] **Step 8: Stub `src/pi-host/index.ts`**

```ts
// Pi-host utility process. Spawned by main; listens on a MessagePort.
// Implementation lands in Phase E.
process.parentPort?.once("message", (e) => {
  // Consume the initial port handshake from main; full protocol added later.
  void e;
});
```

- [ ] **Step 9: Update `src/main/index.ts` to render the new renderer**

The template's main process file references the constants `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` injected by Forge. Keep that as-is; only adjust paths if the template sniffs a different file. Verify by running `npm start`.

- [ ] **Step 10: Update `tsconfig.json`**

Replace the contents with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "*.config.ts", "*.config.js"]
}
```

- [ ] **Step 11: Run typecheck, lint, and start**

```bash
cd /Users/roaanv/mycode/macpi && npm run format && npm run lint && npm run typecheck && npm start
```

Expected: window opens showing "macpi — foundation milestone".

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(layout): split src into main/preload/renderer/pi-host/shared bundles"
```

---

### Task 5: Define the IPC envelope type and registry

**Files:**
- Create: `src/shared/ipc-types.ts`, `tests/unit/ipc-envelope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ipc-envelope.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOk, isErr, ok, err, type IpcResult } from "../../src/shared/ipc-types";

describe("IPC envelope", () => {
  it("ok() builds a success envelope", () => {
    const r = ok({ x: 1 });
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) expect(r.data.x).toBe(1);
  });

  it("err() builds a failure envelope", () => {
    const r = err("not_found", "no such channel");
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) {
      expect(r.error.code).toBe("not_found");
      expect(r.error.message).toBe("no such channel");
    }
  });

  it("narrows correctly via the discriminated union", () => {
    const r: IpcResult<number> = Math.random() > 2 ? ok(1) : err("oops", "msg");
    if (isOk(r)) {
      const _x: number = r.data;
      expect(typeof _x).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/ipc-envelope.test.ts
```

Expected: FAIL — module `src/shared/ipc-types` does not exist.

- [ ] **Step 3: Implement `src/shared/ipc-types.ts`**

```ts
// IPC envelope used everywhere across renderer↔main and main↔pi-host boundaries.
// We never throw across the wire — every call returns ok() or err().

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data });
export const err = <T = never>(code: string, message: string): IpcResult<T> => ({
  ok: false,
  error: { code, message },
});

export const isOk = <T>(r: IpcResult<T>): r is { ok: true; data: T } => r.ok;
export const isErr = <T>(r: IpcResult<T>): r is { ok: false; error: { code: string; message: string } } => !r.ok;

// Method registry. Each entry maps method name → request/response shapes.
// Adding a method here is the only way to expose a new IPC call to the renderer.
// Lands progressively across this plan; entries are added when the corresponding
// handler is implemented (Tasks 9, 14, 18, 21, 26).
export interface IpcMethods {
  "ping": { req: { value: string }; res: { value: string } };
}

export type IpcMethodName = keyof IpcMethods;
```

- [ ] **Step 4: Run test, expect pass**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/ipc-envelope.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-types.ts tests/unit/ipc-envelope.test.ts
git commit -m "feat(ipc): add typed envelope and method registry"
```

---

## Phase C — Database

### Task 6: Add `better-sqlite3` and a typed connection wrapper

**Files:**
- Create: `src/main/db/connection.ts`
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
cd /Users/roaanv/mycode/macpi && npm install better-sqlite3@^11
npm install --save-dev @types/better-sqlite3@^7
```

- [ ] **Step 2: Forge has to rebuild native modules. Confirm the install works**

```bash
cd /Users/roaanv/mycode/macpi && npm rebuild better-sqlite3 && npm start
```

Expected: window opens. If you see a NODE_MODULE_VERSION mismatch error, run:

```bash
cd /Users/roaanv/mycode/macpi && npx electron-rebuild
```

…and try again. (Electron Forge's `electron-rebuild` plugin is wired by the template.)

- [ ] **Step 3: Implement `src/main/db/connection.ts`**

```ts
import Database, { type Database as DbType } from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface DbHandle {
  raw: DbType;
  close: () => void;
}

export interface OpenDbOptions {
  /** Absolute path to the SQLite file. */
  filename: string;
  /** Whether to enable WAL (default true). */
  wal?: boolean;
}

export function openDb(options: OpenDbOptions): DbHandle {
  fs.mkdirSync(path.dirname(options.filename), { recursive: true });
  const raw = new Database(options.filename);
  if (options.wal !== false) {
    raw.pragma("journal_mode = WAL");
  }
  raw.pragma("foreign_keys = ON");
  return {
    raw,
    close: () => raw.close(),
  };
}

/** Run `fn` inside a transaction. Re-throws on failure (caller wraps). */
export function tx<T>(db: DbHandle, fn: (db: DbHandle) => T): T {
  return db.raw.transaction(() => fn(db))();
}
```

- [ ] **Step 4: Commit (no test yet — covered by migration tests in Task 7)**

```bash
git add -A
git commit -m "feat(db): add better-sqlite3 connection wrapper with WAL + FK on"
```

---

### Task 7: Migration runner + initial schema

**Files:**
- Create: `src/main/db/migrations.ts`, `src/main/db/migrations/0001-init.sql`, `tests/unit/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/migrations.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { openDb, type DbHandle } from "../../src/main/db/connection";
import { runMigrations, currentVersion } from "../../src/main/db/migrations";

let dir: string;
let db: DbHandle;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-mig-"));
  db = openDb({ filename: path.join(dir, "test.db") });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("starts at version 0 and applies 0001", () => {
    expect(currentVersion(db)).toBe(0);
    runMigrations(db);
    expect(currentVersion(db)).toBe(1);
  });

  it("is idempotent on re-run", () => {
    runMigrations(db);
    runMigrations(db);
    expect(currentVersion(db)).toBe(1);
  });

  it("creates the channels table", () => {
    runMigrations(db);
    const row = db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channels'")
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("channels");
  });

  it("rolls back the transaction on a failing migration", () => {
    const fakeFs = {
      list: () => [
        { version: 1, sql: "CREATE TABLE good (a INT);" },
        { version: 2, sql: "CREATE TABLE bad (this is not sql);" },
      ],
    };
    expect(() => runMigrations(db, fakeFs)).toThrow();
    // Migration 1's table should NOT exist because we run all-or-nothing per version,
    // and version 2 failed — but version 1 should have committed independently.
    // Per spec §11: migrations run inside a transaction *per migration*, not all together.
    // So `good` should exist and version should be 1.
    const row = db.raw.prepare("SELECT name FROM sqlite_master WHERE name='good'").get();
    expect(row).toBeTruthy();
    expect(currentVersion(db)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/migrations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration SQL**

Create `src/main/db/migrations/0001-init.sql`:

```sql
CREATE TABLE channels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL,
  icon        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE channel_sessions (
  channel_id     TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  pi_session_id  TEXT NOT NULL,
  position       INTEGER NOT NULL,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (channel_id, pi_session_id)
);
CREATE INDEX idx_channel_sessions_session ON channel_sessions(pi_session_id);

CREATE TABLE settings_global (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE settings_channel (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (channel_id, key)
);

CREATE TABLE settings_session (
  pi_session_id TEXT NOT NULL,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  PRIMARY KEY (pi_session_id, key)
);

CREATE TABLE ui_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
```

- [ ] **Step 4: Implement `src/main/db/migrations.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { DbHandle } from "./connection";

export interface MigrationFile {
  version: number;
  sql: string;
}

export interface MigrationFs {
  list(): MigrationFile[];
}

const defaultFs: MigrationFs = {
  list(): MigrationFile[] {
    const dir = path.join(__dirname, "migrations");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-.*\.sql$/.test(f))
      .sort()
      .map((f) => ({
        version: Number.parseInt(f.slice(0, 4), 10),
        sql: fs.readFileSync(path.join(dir, f), "utf8"),
      }));
  },
};

function ensureMigrationsTable(db: DbHandle) {
  db.raw.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version  INTEGER PRIMARY KEY,
    applied  INTEGER NOT NULL
  )`);
}

export function currentVersion(db: DbHandle): number {
  ensureMigrationsTable(db);
  const row = db.raw
    .prepare("SELECT MAX(version) as v FROM _migrations")
    .get() as { v: number | null };
  return row.v ?? 0;
}

/** Apply pending migrations in order. Each migration runs in its own transaction. */
export function runMigrations(db: DbHandle, fsImpl: MigrationFs = defaultFs): void {
  ensureMigrationsTable(db);
  const have = currentVersion(db);
  for (const m of fsImpl.list()) {
    if (m.version <= have) continue;
    const tx = db.raw.transaction(() => {
      db.raw.exec(m.sql);
      db.raw.prepare("INSERT INTO _migrations (version, applied) VALUES (?, ?)").run(m.version, Date.now());
    });
    tx();
  }
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/migrations.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Make Vite copy the migration SQL files into the main bundle output**

Forge's main bundle is built by Vite as a Node CJS bundle. SQL files are not bundled. Update `vite.main.config.ts` to copy them:

Install:

```bash
cd /Users/roaanv/mycode/macpi && npm install --save-dev vite-plugin-static-copy@^3
```

Edit `vite.main.config.ts`:

```ts
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "node:path";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: path.resolve(__dirname, "src/main/db/migrations/*.sql"),
          dest: "migrations",
        },
      ],
    }),
  ],
  build: {
    rollupOptions: {
      external: ["better-sqlite3", "electron", /^node:/],
    },
  },
});
```

Then update the migrations module to find the files relative to the bundled `index.js` location:

In `src/main/db/migrations.ts`, replace the `dir` line in `defaultFs.list()` with:

```ts
const dir = process.env.MACPI_MIGRATIONS_DIR ?? path.join(__dirname, "migrations");
```

(Tests can set `MACPI_MIGRATIONS_DIR` to the source directory; the bundled binary picks up the copied files alongside `index.js`.)

Update the test file `tests/unit/migrations.test.ts` to point `MACPI_MIGRATIONS_DIR` at the source directory before each test:

```ts
beforeEach(() => {
  process.env.MACPI_MIGRATIONS_DIR = path.resolve(__dirname, "../../src/main/db/migrations");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-mig-"));
  db = openDb({ filename: path.join(dir, "test.db") });
});
```

Re-run the tests; they should still pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add migration runner and initial schema (channels, sessions, settings, ui_state)"
```

---

## Phase D — Settings cascade resolver

### Task 8: Define cascade keys, defaults, and pure resolver

**Files:**
- Create: `src/shared/settings-keys.ts`, `src/main/settings/resolver.ts`, `tests/unit/settings-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/settings-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSettings, type SettingsLayers } from "../../src/main/settings/resolver";
import { DEFAULT_SETTINGS } from "../../src/shared/settings-keys";

describe("settings resolver", () => {
  it("returns defaults when no overrides present", () => {
    const layers: SettingsLayers = { global: {}, channel: {}, session: {} };
    const r = resolveSettings(layers);
    expect(r.values.thinkingLevel).toBe(DEFAULT_SETTINGS.thinkingLevel);
    expect(r.provenance.thinkingLevel).toBe("default");
  });

  it("session overrides channel overrides global", () => {
    const layers: SettingsLayers = {
      global: { thinkingLevel: "low" },
      channel: { thinkingLevel: "medium" },
      session: { thinkingLevel: "high" },
    };
    const r = resolveSettings(layers);
    expect(r.values.thinkingLevel).toBe("high");
    expect(r.provenance.thinkingLevel).toBe("session");
  });

  it("channel wins when no session override", () => {
    const layers: SettingsLayers = {
      global: { thinkingLevel: "low" },
      channel: { thinkingLevel: "medium" },
      session: {},
    };
    const r = resolveSettings(layers);
    expect(r.values.thinkingLevel).toBe("medium");
    expect(r.provenance.thinkingLevel).toBe("channel");
  });

  it("falls back through unset layers", () => {
    const layers: SettingsLayers = {
      global: { thinkingLevel: "low" },
      channel: {},
      session: {},
    };
    const r = resolveSettings(layers);
    expect(r.values.thinkingLevel).toBe("low");
    expect(r.provenance.thinkingLevel).toBe("global");
  });

  it("array values are replaced wholesale (not merged)", () => {
    const layers: SettingsLayers = {
      global: { enabledSkills: ["a", "b"] },
      channel: { enabledSkills: ["c"] },
      session: {},
    };
    const r = resolveSettings(layers);
    expect(r.values.enabledSkills).toEqual(["c"]);
    expect(r.provenance.enabledSkills).toBe("channel");
  });

  it("missing key from defaults stays absent", () => {
    const layers: SettingsLayers = { global: {}, channel: {}, session: {} };
    const r = resolveSettings(layers);
    // systemPrompt has no default — should be null
    expect(r.values.systemPrompt).toBeNull();
    expect(r.provenance.systemPrompt).toBe("default");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/settings-resolver.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/shared/settings-keys.ts`**

```ts
// Cascade keys + their defaults. The cascade resolver is pure and depends only on this module.

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface SettingsValues {
  model: ModelRef | null;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string | null;
  cwd: string | null;
  enabledSkills: string[];
  enabledExtensions: string[];
  enabledPrompts: string[];
  allowedToolNames: string[] | null;
  noTools: "all" | "builtin" | null;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  model: null,
  thinkingLevel: "medium",
  systemPrompt: null,
  cwd: null,
  enabledSkills: [],
  enabledExtensions: [],
  enabledPrompts: [],
  allowedToolNames: null,
  noTools: null,
};

export type SettingsKey = keyof SettingsValues;

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];
```

- [ ] **Step 4: Implement `src/main/settings/resolver.ts`**

```ts
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  type SettingsKey,
  type SettingsValues,
} from "../../shared/settings-keys";

export type Layer = "default" | "global" | "channel" | "session";

export type LayerOverrides = Partial<SettingsValues>;

export interface SettingsLayers {
  global: LayerOverrides;
  channel: LayerOverrides;
  session: LayerOverrides;
}

export interface ResolvedSettings {
  values: SettingsValues;
  provenance: Record<SettingsKey, Layer>;
}

const ORDER: ("session" | "channel" | "global")[] = ["session", "channel", "global"];

export function resolveSettings(layers: SettingsLayers): ResolvedSettings {
  const values = { ...DEFAULT_SETTINGS } as SettingsValues;
  const provenance = {} as Record<SettingsKey, Layer>;

  for (const key of SETTINGS_KEYS) {
    let assigned: Layer = "default";
    for (const layerName of ORDER) {
      const layer = layers[layerName];
      if (key in layer && layer[key] !== undefined) {
        // Type assertion is safe: we just confirmed the key exists in the layer.
        (values[key] as unknown) = layer[key] as unknown;
        assigned = layerName;
        break;
      }
    }
    provenance[key] = assigned;
  }
  return { values, provenance };
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/unit/settings-resolver.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(settings): add cascade keys, defaults, and pure resolver"
```

---

## Phase E — Channels repository

### Task 9: Channels CRUD repo with tests

**Files:**
- Create: `src/main/repos/channels.ts`, `tests/integration/channels-repo.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/channels-repo.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { openDb, type DbHandle } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { ChannelsRepo } from "../../src/main/repos/channels";

let dir: string;
let db: DbHandle;
let repo: ChannelsRepo;

beforeEach(() => {
  process.env.MACPI_MIGRATIONS_DIR = path.resolve(__dirname, "../../src/main/db/migrations");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-channels-"));
  db = openDb({ filename: path.join(dir, "test.db") });
  runMigrations(db);
  repo = new ChannelsRepo(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("ChannelsRepo", () => {
  it("creates a channel and lists it", () => {
    const c = repo.create({ name: "general" });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe("general");
    const all = repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(c.id);
  });

  it("lists channels in `position` order", () => {
    const a = repo.create({ name: "a" });
    const b = repo.create({ name: "b" });
    const c = repo.create({ name: "c" });
    expect(repo.list().map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("renames a channel", () => {
    const c = repo.create({ name: "scratch" });
    repo.rename(c.id, "macpi-dev");
    expect(repo.list()[0].name).toBe("macpi-dev");
  });

  it("deletes a channel", () => {
    const c = repo.create({ name: "tmp" });
    repo.delete(c.id);
    expect(repo.list()).toHaveLength(0);
  });

  it("getById returns null for unknown channel", () => {
    expect(repo.getById("no-such-id")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/integration/channels-repo.test.ts
```

Expected: FAIL — `ChannelsRepo` not found.

- [ ] **Step 3: Implement `src/main/repos/channels.ts`**

```ts
import { randomUUID } from "node:crypto";
import type { DbHandle } from "../db/connection";

export interface Channel {
  id: string;
  name: string;
  position: number;
  icon: string | null;
  createdAt: number;
}

export interface CreateChannelInput {
  name: string;
  icon?: string;
}

export class ChannelsRepo {
  constructor(private readonly db: DbHandle) {}

  create(input: CreateChannelInput): Channel {
    const id = randomUUID();
    const now = Date.now();
    const nextPos = this.nextPosition();
    this.db.raw
      .prepare("INSERT INTO channels (id, name, position, icon, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, input.name, nextPos, input.icon ?? null, now);
    return { id, name: input.name, position: nextPos, icon: input.icon ?? null, createdAt: now };
  }

  list(): Channel[] {
    const rows = this.db.raw
      .prepare("SELECT id, name, position, icon, created_at as createdAt FROM channels ORDER BY position ASC")
      .all() as Channel[];
    return rows;
  }

  getById(id: string): Channel | null {
    const row = this.db.raw
      .prepare("SELECT id, name, position, icon, created_at as createdAt FROM channels WHERE id = ?")
      .get(id) as Channel | undefined;
    return row ?? null;
  }

  rename(id: string, name: string): void {
    this.db.raw.prepare("UPDATE channels SET name = ? WHERE id = ?").run(name, id);
  }

  delete(id: string): void {
    this.db.raw.prepare("DELETE FROM channels WHERE id = ?").run(id);
  }

  private nextPosition(): number {
    const row = this.db.raw.prepare("SELECT MAX(position) AS max FROM channels").get() as { max: number | null };
    return (row.max ?? -1) + 1;
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/integration/channels-repo.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(repos): add ChannelsRepo with create/list/get/rename/delete"
```

---

### Task 10: Channel-sessions mapping repo

**Files:**
- Create: `src/main/repos/channel-sessions.ts`
- Modify: `tests/integration/channels-repo.test.ts` (add cascade-delete cases — kept here so the file owns tests for both repos)

- [ ] **Step 1: Append cascade-delete test cases to `tests/integration/channels-repo.test.ts`**

Add this `describe` block after the existing `describe("ChannelsRepo", ...)` block:

```ts
import { ChannelSessionsRepo } from "../../src/main/repos/channel-sessions";

describe("ChannelSessionsRepo", () => {
  let sessionsRepo: ChannelSessionsRepo;
  let channelId: string;

  beforeEach(() => {
    sessionsRepo = new ChannelSessionsRepo(db);
    channelId = repo.create({ name: "test" }).id;
  });

  it("attaches a pi session to a channel", () => {
    sessionsRepo.attach(channelId, "pi-session-abc");
    const ids = sessionsRepo.listByChannel(channelId);
    expect(ids).toEqual(["pi-session-abc"]);
  });

  it("preserves attach order via position", () => {
    sessionsRepo.attach(channelId, "s1");
    sessionsRepo.attach(channelId, "s2");
    sessionsRepo.attach(channelId, "s3");
    expect(sessionsRepo.listByChannel(channelId)).toEqual(["s1", "s2", "s3"]);
  });

  it("findChannelOf returns the owning channel", () => {
    sessionsRepo.attach(channelId, "s1");
    expect(sessionsRepo.findChannelOf("s1")).toBe(channelId);
    expect(sessionsRepo.findChannelOf("missing")).toBeNull();
  });

  it("detach removes the mapping", () => {
    sessionsRepo.attach(channelId, "s1");
    sessionsRepo.detach(channelId, "s1");
    expect(sessionsRepo.listByChannel(channelId)).toEqual([]);
  });

  it("deleting a channel cascades to channel_sessions", () => {
    sessionsRepo.attach(channelId, "s1");
    sessionsRepo.attach(channelId, "s2");
    repo.delete(channelId);
    expect(sessionsRepo.listByChannel(channelId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/integration/channels-repo.test.ts
```

Expected: FAIL — `ChannelSessionsRepo` not found.

- [ ] **Step 3: Implement `src/main/repos/channel-sessions.ts`**

```ts
import type { DbHandle } from "../db/connection";

export class ChannelSessionsRepo {
  constructor(private readonly db: DbHandle) {}

  attach(channelId: string, piSessionId: string): void {
    const nextPos = this.nextPosition(channelId);
    this.db.raw
      .prepare(
        "INSERT INTO channel_sessions (channel_id, pi_session_id, position, added_at) VALUES (?, ?, ?, ?)",
      )
      .run(channelId, piSessionId, nextPos, Date.now());
  }

  detach(channelId: string, piSessionId: string): void {
    this.db.raw
      .prepare("DELETE FROM channel_sessions WHERE channel_id = ? AND pi_session_id = ?")
      .run(channelId, piSessionId);
  }

  listByChannel(channelId: string): string[] {
    const rows = this.db.raw
      .prepare(
        "SELECT pi_session_id AS piSessionId FROM channel_sessions WHERE channel_id = ? ORDER BY position ASC",
      )
      .all(channelId) as Array<{ piSessionId: string }>;
    return rows.map((r) => r.piSessionId);
  }

  findChannelOf(piSessionId: string): string | null {
    const row = this.db.raw
      .prepare("SELECT channel_id AS channelId FROM channel_sessions WHERE pi_session_id = ?")
      .get(piSessionId) as { channelId: string } | undefined;
    return row?.channelId ?? null;
  }

  private nextPosition(channelId: string): number {
    const row = this.db.raw
      .prepare("SELECT MAX(position) AS max FROM channel_sessions WHERE channel_id = ?")
      .get(channelId) as { max: number | null };
    return (row.max ?? -1) + 1;
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/integration/channels-repo.test.ts
```

Expected: 10 tests pass (5 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(repos): add ChannelSessionsRepo with cascade-delete on channel removal"
```

---

## Phase F — Pi-host process

### Task 11: Define the main↔pi-host protocol

**Files:**
- Create: `src/shared/pi-host-protocol.ts`

This is a types-only module — no behavior to test. It defines the message shapes both sides serialize/parse against.

- [ ] **Step 1: Create the file**

```ts
// Protocol used between main process and pi-host (utilityProcess), exchanged
// over a MessagePort. All requests carry a correlation id; replies use the same id.
//
// Note: at this stage we keep events simple. Plan 2 will expand events to include
// the full AgentSessionEvent surface (tool calls, compaction, retry, branching).

export type Correlation = string;

// ---- Requests (main → pi-host) ----

export type PiHostRequest =
  | { type: "ping"; corr: Correlation }
  | { type: "session.create"; corr: Correlation; cwd: string }
  | { type: "session.continue"; corr: Correlation; piSessionId: string }
  | { type: "session.prompt"; corr: Correlation; piSessionId: string; text: string };

// ---- Replies (pi-host → main, in response to a request) ----

export type PiHostReply<T = unknown> =
  | { type: "ok"; corr: Correlation; data: T }
  | { type: "err"; corr: Correlation; code: string; message: string };

// ---- Events (pi-host → main, no correlation; broadcast from sessions) ----
//
// Foundation milestone forwards only the bare minimum: text-delta tokens and
// turn-end. Plan 2 adds tool-execution events, message lifecycle, retry/compaction
// banners, and queue updates. Errors during prompt() surface via the request's
// reply (PiHostReply with type: "err"); there is no top-level "session.error"
// event in pi.

export type PiHostEvent =
  | { type: "session.token"; piSessionId: string; delta: string }
  | { type: "session.turn_end"; piSessionId: string };

// Top-level wire types
export type PiHostInbound = PiHostRequest;
export type PiHostOutbound = PiHostReply | PiHostEvent;
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/roaanv/mycode/macpi && npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/pi-host-protocol.ts
git commit -m "feat(pi-host): define request/reply/event protocol types"
```

---

### Task 12: Install pi-coding-agent and stub the pi-host session manager

**Files:**
- Modify: `package.json`
- Create: `src/pi-host/session-manager.ts`
- Modify: `src/pi-host/index.ts`

- [ ] **Step 1: Install**

```bash
cd /Users/roaanv/mycode/macpi && npm install @earendil-works/pi-coding-agent@^0.74
```

- [ ] **Step 2: Confirm the SDK exports we expect**

Run:

```bash
cd /Users/roaanv/mycode/macpi && node --input-type=module -e "import * as p from '@earendil-works/pi-coding-agent'; console.log(Object.keys(p).sort().filter(k => /Agent|Session|Auth|Resource|ModelRegistry/.test(k)))"
```

Expected: includes `AgentSession`, `createAgentSession`, `AuthStorage`, `ModelRegistry`, `SessionManager`, `DefaultResourceLoader`. If anything is missing, stop and check the installed version (`npm ls @earendil-works/pi-coding-agent`).

- [ ] **Step 3: Implement `src/pi-host/session-manager.ts`**

```ts
import { AgentSession, createAgentSession, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export interface ActiveSession {
  piSessionId: string;
  session: AgentSession;
  unsubscribe: () => void;
}

export class PiHostSessionManager {
  private readonly active = new Map<string, ActiveSession>();
  private readonly authStorage = AuthStorage.create();
  private readonly modelRegistry = ModelRegistry.create(this.authStorage);

  /** Emit forwarded to the host's outbound channel. */
  constructor(private readonly emit: (event: import("../shared/pi-host-protocol").PiHostEvent) => void) {}

  async createSession(opts: { cwd: string }): Promise<string> {
    const result = await createAgentSession({
      cwd: opts.cwd,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
    });
    const session = result.session;
    const piSessionId = session.sessionId;
    const unsubscribe = session.subscribe((event) => {
      // Foundation milestone forwards only token deltas and turn_end.
      // Full event mapping (tool calls, compaction, retry, queue updates,
      // branching, message lifecycle) arrives in Plan 2.
      //
      // Pi's AgentSessionEvent shape (from pi/packages/coding-agent docs/json.md):
      //   type "message_update" carries assistantMessageEvent, which itself has
      //   type "text_delta" with a `delta: string` field. That's where streaming
      //   tokens live.
      //   type "turn_end" signals the assistant turn is over.
      // See: pi/packages/coding-agent/docs/json.md (research-only).
      if (event.type === "message_update") {
        const ame = (event as { assistantMessageEvent?: { type?: string; delta?: string } })
          .assistantMessageEvent;
        if (ame?.type === "text_delta" && typeof ame.delta === "string") {
          this.emit({ type: "session.token", piSessionId, delta: ame.delta });
        }
        return;
      }
      if (event.type === "turn_end") {
        this.emit({ type: "session.turn_end", piSessionId });
        return;
      }
      // Other events ignored intentionally for foundation.
    });
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
  }
}
```

> **Verification source for these event names:** `pi/packages/coding-agent/docs/json.md` (research-only). `message_update` with `assistantMessageEvent.type === "text_delta"` is where streaming tokens live; `turn_end` signals assistant turn completion. `session.sessionId` is a documented getter on the `AgentSession` class. If the installed `@earendil-works/pi-coding-agent ^0.74` runtime disagrees, fix the names here against `node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts` — do not invent.

- [ ] **Step 4: Update `src/pi-host/index.ts` to wire the protocol**

```ts
import type { MessagePortMain } from "electron";
import {
  type PiHostEvent,
  type PiHostInbound,
  type PiHostReply,
} from "../shared/pi-host-protocol";
import { PiHostSessionManager } from "./session-manager";

let port: MessagePortMain | null = null;
let manager: PiHostSessionManager | null = null;

function send(out: PiHostReply | PiHostEvent) {
  port?.postMessage(out);
}

async function handle(req: PiHostInbound) {
  if (!manager) throw new Error("pi-host not initialized");
  try {
    switch (req.type) {
      case "ping":
        send({ type: "ok", corr: req.corr, data: { pong: true } });
        return;
      case "session.create": {
        const id = await manager.createSession({ cwd: req.cwd });
        send({ type: "ok", corr: req.corr, data: { piSessionId: id } });
        return;
      }
      case "session.prompt":
        await manager.prompt(req.piSessionId, req.text);
        send({ type: "ok", corr: req.corr, data: { accepted: true } });
        return;
      case "session.continue":
        send({
          type: "err",
          corr: req.corr,
          code: "not_implemented",
          message: "session.continue lands in plan 5 (crash recovery)",
        });
        return;
    }
  } catch (e) {
    send({
      type: "err",
      corr: req.corr,
      code: "exception",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

process.parentPort?.once("message", (e) => {
  port = e.ports[0] ?? null;
  if (!port) {
    process.exit(2);
  }
  manager = new PiHostSessionManager((event) => send(event));
  port.on("message", (msg) => {
    void handle(msg.data as PiHostInbound);
  });
  port.start();
});

process.on("beforeExit", () => {
  manager?.shutdown();
});
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/roaanv/mycode/macpi && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pi-host): scaffold session manager with token/turn_end forwarding"
```

---

### Task 13: Main-side pi-host supervisor

**Files:**
- Create: `src/main/pi-host-manager.ts`

- [ ] **Step 1: Implement `src/main/pi-host-manager.ts`**

```ts
import { app, MessageChannelMain, type UtilityProcess, utilityProcess } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  type PiHostEvent,
  type PiHostInbound,
  type PiHostOutbound,
  type PiHostReply,
  type PiHostRequest,
} from "../shared/pi-host-protocol";

interface Pending {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
}

export type PiHostEventListener = (event: PiHostEvent) => void;

export class PiHostManager {
  private process: UtilityProcess | null = null;
  private mainPort: Electron.MessagePortMain | null = null;
  private pending = new Map<string, Pending>();
  private listeners = new Set<PiHostEventListener>();

  start(): void {
    const entry = path.join(__dirname, "pi-host.js"); // copied alongside main bundle by Forge
    const proc = utilityProcess.fork(entry, [], {
      stdio: "pipe",
      serviceName: "pi-host",
    });
    const channel = new MessageChannelMain();
    proc.postMessage({ kind: "init" }, [channel.port2]);
    channel.port1.on("message", (e) => this.onMessage(e.data as PiHostOutbound));
    channel.port1.start();
    proc.on("exit", (code) => {
      this.onExit(code);
    });
    proc.stdout?.on("data", (b: Buffer) => process.stderr.write(`[pi-host:stdout] ${b.toString()}`));
    proc.stderr?.on("data", (b: Buffer) => process.stderr.write(`[pi-host:stderr] ${b.toString()}`));
    this.process = proc;
    this.mainPort = channel.port1;
  }

  onEvent(listener: PiHostEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async request<T>(req: Omit<PiHostRequest, "corr"> & { corr?: string }): Promise<T> {
    if (!this.mainPort) throw new Error("pi-host not started");
    const corr = req.corr ?? randomUUID();
    const message = { ...req, corr } as PiHostInbound;
    return await new Promise<T>((resolve, reject) => {
      this.pending.set(corr, { resolve: (d) => resolve(d as T), reject });
      this.mainPort?.postMessage(message);
    });
  }

  shutdown(): void {
    this.process?.kill();
    this.process = null;
    this.mainPort = null;
    for (const p of this.pending.values()) p.reject(new Error("pi-host shutting down"));
    this.pending.clear();
    this.listeners.clear();
  }

  private onMessage(out: PiHostOutbound) {
    if ("corr" in out) {
      const reply = out as PiHostReply;
      const pending = this.pending.get(reply.corr);
      if (!pending) return;
      this.pending.delete(reply.corr);
      if (reply.type === "ok") pending.resolve(reply.data);
      else pending.reject(new Error(`${reply.code}: ${reply.message}`));
      return;
    }
    for (const l of this.listeners) l(out as PiHostEvent);
  }

  private onExit(code: number | null) {
    // Plan 5 expands this with crash-loop guard + auto-respawn.
    // For the foundation milestone we log and surface an error to pending callers.
    const err = new Error(`pi-host exited (code=${code ?? "null"})`);
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
    this.process = null;
    this.mainPort = null;
  }
}

export function piHostBundlePath(): string {
  // When packaged, `pi-host.js` lives alongside the main bundle.
  // When running `npm start`, Vite emits both into `.vite/build`.
  return path.join(app.getAppPath(), ".vite", "build", "pi-host.js");
}
```

- [ ] **Step 2: Make Forge build the pi-host as a separate bundle**

Open `forge.config.ts` and confirm the third `build` entry from Task 4 step 5 has `entry: "src/pi-host/index.ts"`. If not, add it. Then check that running `npm start` produces `.vite/build/pi-host.js`.

```bash
cd /Users/roaanv/mycode/macpi && rm -rf .vite && npm start
```

Expected: window opens. After closing, run:

```bash
ls /Users/roaanv/mycode/macpi/.vite/build
```

Expected: includes `main.js`, `preload.js`, `pi-host.js`.

- [ ] **Step 3: Replace `__dirname`-based entry path with the helper**

In `src/main/pi-host-manager.ts`, replace:

```ts
const entry = path.join(__dirname, "pi-host.js");
```

with:

```ts
const entry = piHostBundlePath();
```

Move `piHostBundlePath` above the class so it's defined first, or import it from itself — actually keep it where it is and use `piHostBundlePath()` directly inside the class:

```ts
const entry = piHostBundlePath();
```

(Only the class body changes; no other moves needed since the function is declared in the same module.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pi-host): main-side supervisor with request/event channel"
```

---

## Phase G — IPC router and renderer plumbing

### Task 14: Wire main IPC and contextBridge with `ping` + `channels.list`

**Files:**
- Create: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/shared/ipc-types.ts`, `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Extend the IPC method registry**

Edit `src/shared/ipc-types.ts`. Replace the `IpcMethods` interface with:

```ts
export interface IpcMethods {
  "ping": { req: { value: string }; res: { value: string } };
  "channels.list": { req: Record<string, never>; res: { channels: { id: string; name: string; position: number; icon: string | null; createdAt: number }[] } };
  "channels.create": { req: { name: string; icon?: string }; res: { id: string } };
  "channels.rename": { req: { id: string; name: string }; res: Record<string, never> };
  "channels.delete": { req: { id: string }; res: Record<string, never> };
  "session.create": { req: { channelId: string; cwd: string }; res: { piSessionId: string } };
  "session.prompt": { req: { piSessionId: string; text: string }; res: Record<string, never> };
  "session.listForChannel": { req: { channelId: string }; res: { piSessionIds: string[] } };
}
```

- [ ] **Step 2: Implement `src/main/ipc-router.ts`**

```ts
import { ipcMain } from "electron";
import { type IpcMethodName, type IpcMethods, type IpcResult, err, ok } from "../shared/ipc-types";
import type { ChannelsRepo } from "./repos/channels";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import type { PiHostManager } from "./pi-host-manager";

type Handler<M extends IpcMethodName> = (
  args: IpcMethods[M]["req"],
) => Promise<IpcResult<IpcMethods[M]["res"]>> | IpcResult<IpcMethods[M]["res"]>;

export interface RouterDeps {
  channels: ChannelsRepo;
  channelSessions: ChannelSessionsRepo;
  piHost: PiHostManager;
}

export class IpcRouter {
  private handlers = new Map<IpcMethodName, Handler<IpcMethodName>>();

  constructor(private readonly deps: RouterDeps) {
    this.register("ping", async (args) => ok({ value: args.value }));
    this.register("channels.list", async () => ok({ channels: this.deps.channels.list() }));
    this.register("channels.create", async (args) => {
      const c = this.deps.channels.create({ name: args.name, icon: args.icon });
      return ok({ id: c.id });
    });
    this.register("channels.rename", async (args) => {
      this.deps.channels.rename(args.id, args.name);
      return ok({});
    });
    this.register("channels.delete", async (args) => {
      this.deps.channels.delete(args.id);
      return ok({});
    });
    this.register("session.create", async (args) => {
      const channel = this.deps.channels.getById(args.channelId);
      if (!channel) return err("not_found", `channel ${args.channelId} not found`);
      const reply = await this.deps.piHost.request<{ piSessionId: string }>({
        type: "session.create",
        cwd: args.cwd,
      });
      this.deps.channelSessions.attach(args.channelId, reply.piSessionId);
      return ok({ piSessionId: reply.piSessionId });
    });
    this.register("session.prompt", async (args) => {
      await this.deps.piHost.request<{ accepted: boolean }>({
        type: "session.prompt",
        piSessionId: args.piSessionId,
        text: args.text,
      });
      return ok({});
    });
    this.register("session.listForChannel", async (args) => {
      return ok({ piSessionIds: this.deps.channelSessions.listByChannel(args.channelId) });
    });
  }

  attach(): void {
    ipcMain.handle("macpi:invoke", async (_e, method: IpcMethodName, args: unknown) => {
      const handler = this.handlers.get(method);
      if (!handler) return err("unknown_method", `unknown IPC method ${String(method)}`);
      try {
        return await handler(args as never);
      } catch (e) {
        return err("exception", e instanceof Error ? e.message : String(e));
      }
    });
  }

  detach(): void {
    ipcMain.removeHandler("macpi:invoke");
  }

  private register<M extends IpcMethodName>(method: M, fn: Handler<M>) {
    this.handlers.set(method, fn as Handler<IpcMethodName>);
  }
}
```

- [ ] **Step 3: Implement preload `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { IpcMethodName, IpcMethods, IpcResult } from "../shared/ipc-types";

const api = {
  invoke<M extends IpcMethodName>(
    method: M,
    args: IpcMethods[M]["req"],
  ): Promise<IpcResult<IpcMethods[M]["res"]>> {
    return ipcRenderer.invoke("macpi:invoke", method, args);
  },
  onPiHostEvent(listener: (event: unknown) => void): () => void {
    const wrapped = (_e: Electron.IpcRendererEvent, ev: unknown) => listener(ev);
    ipcRenderer.on("macpi:pi-host-event", wrapped);
    return () => ipcRenderer.off("macpi:pi-host-event", wrapped);
  },
};

contextBridge.exposeInMainWorld("macpi", api);

declare global {
  interface Window {
    macpi: typeof api;
  }
}
```

- [ ] **Step 4: Wire it all in `src/main/index.ts`**

Replace the existing main entry with:

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { openDb } from "./db/connection";
import { runMigrations } from "./db/migrations";
import { ChannelsRepo } from "./repos/channels";
import { ChannelSessionsRepo } from "./repos/channel-sessions";
import { PiHostManager } from "./pi-host-manager";
import { IpcRouter } from "./ipc-router";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let piHost: PiHostManager | null = null;
let router: IpcRouter | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "macpi",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false, // we use better-sqlite3 from main, not from renderer; sandbox stays renderer-side only
      nodeIntegration: false,
    },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath("userData"), "macpi.db");
  process.env.MACPI_MIGRATIONS_DIR = path.join(__dirname, "migrations");
  const db = openDb({ filename: dbPath });
  runMigrations(db);

  const channels = new ChannelsRepo(db);
  const channelSessions = new ChannelSessionsRepo(db);

  piHost = new PiHostManager();
  piHost.start();
  piHost.onEvent((event) => {
    BrowserWindow.getAllWindows().forEach((w) => w.webContents.send("macpi:pi-host-event", event));
  });

  router = new IpcRouter({ channels, channelSessions, piHost });
  router.attach();

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  router?.detach();
  piHost?.shutdown();
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 5: Run typecheck and start**

```bash
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm start
```

Expected: window opens; close it.

- [ ] **Step 6: Smoke test the `ping` IPC from the renderer**

Edit `src/renderer/main.tsx` temporarily, replacing the `App` body with:

```tsx
function App() {
  const [echo, setEcho] = React.useState<string>("…");
  React.useEffect(() => {
    void window.macpi.invoke("ping", { value: "hello" }).then((r) => {
      if (r.ok) setEcho(r.data.value);
      else setEcho(`err: ${r.error.code}`);
    });
  }, []);
  return <div className="p-4">macpi ping → {echo}</div>;
}
```

```bash
cd /Users/roaanv/mycode/macpi && npm start
```

Expected: window shows `macpi ping → hello`. Close the window.

Revert the temporary change (the proper App lands in Task 16).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ipc): contextBridge router with channels and session methods"
```

---

### Task 15: Integration test for the IPC router (with mocked pi-host)

**Files:**
- Create: `tests/integration/ipc-router.test.ts`

The router calls `ipcMain.handle`, which is awkward to test without an Electron environment. We test the router's logic by exercising its public methods directly via a small adapter.

- [ ] **Step 1: Refactor the router to expose a `dispatch` method usable from tests**

Edit `src/main/ipc-router.ts`. Add this public method on `IpcRouter`:

```ts
async dispatch<M extends IpcMethodName>(
  method: M,
  args: IpcMethods[M]["req"],
): Promise<IpcResult<IpcMethods[M]["res"]>> {
  const handler = this.handlers.get(method);
  if (!handler) return err("unknown_method", `unknown IPC method ${String(method)}`);
  try {
    return await (handler(args as never) as Promise<IpcResult<IpcMethods[M]["res"]>>);
  } catch (e) {
    return err("exception", e instanceof Error ? e.message : String(e));
  }
}
```

And refactor `attach()` to use `dispatch` so the IPC path and the test path share logic:

```ts
attach(): void {
  ipcMain.handle("macpi:invoke", async (_e, method: IpcMethodName, args: unknown) =>
    this.dispatch(method, args as never),
  );
}
```

- [ ] **Step 2: Write the test**

Create `tests/integration/ipc-router.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { openDb, type DbHandle } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { ChannelsRepo } from "../../src/main/repos/channels";
import { ChannelSessionsRepo } from "../../src/main/repos/channel-sessions";
import { IpcRouter } from "../../src/main/ipc-router";
import type { PiHostManager } from "../../src/main/pi-host-manager";

let dir: string;
let db: DbHandle;
let router: IpcRouter;
let piHostMock: { request: ReturnType<typeof vi.fn> };

beforeEach(() => {
  process.env.MACPI_MIGRATIONS_DIR = path.resolve(__dirname, "../../src/main/db/migrations");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-router-"));
  db = openDb({ filename: path.join(dir, "test.db") });
  runMigrations(db);
  piHostMock = { request: vi.fn() };
  router = new IpcRouter({
    channels: new ChannelsRepo(db),
    channelSessions: new ChannelSessionsRepo(db),
    piHost: piHostMock as unknown as PiHostManager,
  });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("IpcRouter", () => {
  it("ping returns the echoed value", async () => {
    const r = await router.dispatch("ping", { value: "hi" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.value).toBe("hi");
  });

  it("channels.create then channels.list returns the new channel", async () => {
    const r1 = await router.dispatch("channels.create", { name: "scratch" });
    expect(r1.ok).toBe(true);
    const r2 = await router.dispatch("channels.list", {});
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.data.channels.map((c) => c.name)).toEqual(["scratch"]);
    }
  });

  it("session.create rejects unknown channel", async () => {
    const r = await router.dispatch("session.create", { channelId: "nope", cwd: "/tmp" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });

  it("session.create attaches the returned pi session id to the channel", async () => {
    const created = await router.dispatch("channels.create", { name: "x" });
    if (!created.ok) throw new Error("setup: channel create failed");
    piHostMock.request.mockResolvedValueOnce({ piSessionId: "sess-1" });

    const r = await router.dispatch("session.create", { channelId: created.data.id, cwd: "/tmp" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.piSessionId).toBe("sess-1");

    const list = await router.dispatch("session.listForChannel", { channelId: created.data.id });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.piSessionIds).toEqual(["sess-1"]);
  });

  it("unknown method returns an unknown_method error", async () => {
    const r = await (router as unknown as { dispatch: (m: string, a: unknown) => Promise<unknown> })
      .dispatch("does.not.exist", {});
    expect((r as { ok: boolean; error?: { code: string } }).ok).toBe(false);
    if (!(r as { ok: boolean }).ok) {
      expect((r as { error: { code: string } }).error.code).toBe("unknown_method");
    }
  });

  it("handler exceptions are caught and surfaced as `exception`", async () => {
    piHostMock.request.mockRejectedValueOnce(new Error("boom"));
    const c = await router.dispatch("channels.create", { name: "x" });
    if (!c.ok) throw new Error("setup");
    const r = await router.dispatch("session.create", { channelId: c.data.id, cwd: "/tmp" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("exception");
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /Users/roaanv/mycode/macpi && npm test -- tests/integration/ipc-router.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(ipc): integration tests for router with mocked pi-host"
```

---

## Phase H — Renderer UI

### Task 16: App shell — three-pane layout (chat-only functionality)

**Files:**
- Create: `src/renderer/App.tsx`, `src/renderer/components/ModeRail.tsx`, `src/renderer/components/ChannelSidebar.tsx`, `src/renderer/components/ChatPane.tsx`, `src/renderer/components/BranchPanel.tsx`, `src/renderer/ipc.ts`, `src/renderer/queries.ts`
- Modify: `src/renderer/main.tsx`

This task is UI scaffolding — large, but each step is small and there's no behavior to test until streaming lands in Task 17.

- [ ] **Step 1: Implement `src/renderer/ipc.ts`**

```ts
import type { IpcMethodName, IpcMethods, IpcResult } from "../shared/ipc-types";

export async function invoke<M extends IpcMethodName>(
  method: M,
  args: IpcMethods[M]["req"],
): Promise<IpcMethods[M]["res"]> {
  const r: IpcResult<IpcMethods[M]["res"]> = await window.macpi.invoke(method, args);
  if (r.ok) return r.data;
  throw new IpcError(r.error.code, r.error.message);
}

export class IpcError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IpcError";
  }
}

export function onPiHostEvent(listener: (event: unknown) => void): () => void {
  return window.macpi.onPiHostEvent(listener);
}
```

- [ ] **Step 2: Implement `src/renderer/queries.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "./ipc";

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => invoke("channels.list", {}),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => invoke("channels.create", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useSessionsForChannel(channelId: string | null) {
  return useQuery({
    queryKey: ["sessions", channelId],
    queryFn: () => (channelId ? invoke("session.listForChannel", { channelId }) : Promise.resolve({ piSessionIds: [] })),
    enabled: !!channelId,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; cwd: string }) => invoke("session.create", input),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ["sessions", vars.channelId] }),
  });
}

export function usePromptSession() {
  return useMutation({
    mutationFn: (input: { piSessionId: string; text: string }) => invoke("session.prompt", input),
  });
}
```

- [ ] **Step 3: Implement `src/renderer/components/ModeRail.tsx`**

```tsx
type Mode = "chat" | "skills" | "extensions" | "prompts" | "settings";

const ICONS: Record<Mode, string> = {
  chat: "💬",
  skills: "🧩",
  extensions: "🧪",
  prompts: "📜",
  settings: "⚙️",
};

export function ModeRail({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
}) {
  const items: { mode: Mode; enabled: boolean }[] = [
    { mode: "chat", enabled: true },
    { mode: "skills", enabled: false },
    { mode: "extensions", enabled: false },
    { mode: "prompts", enabled: false },
    { mode: "settings", enabled: false },
  ];
  return (
    <div className="flex w-12 flex-col items-center gap-2 bg-[#1f1f24] py-2 text-zinc-300">
      {items.map((it) => (
        <button
          key={it.mode}
          type="button"
          disabled={!it.enabled}
          onClick={() => it.enabled && onSelect(it.mode)}
          className={`h-8 w-8 rounded-md text-base transition disabled:opacity-30 ${
            mode === it.mode ? "bg-indigo-600 text-white" : "bg-zinc-800 hover:bg-zinc-700"
          }`}
          title={it.mode}
        >
          {ICONS[it.mode]}
        </button>
      ))}
    </div>
  );
}

export type { Mode };
```

- [ ] **Step 4: Implement `src/renderer/components/ChannelSidebar.tsx`**

```tsx
import React from "react";
import { useChannels, useCreateChannel, useCreateSession, useSessionsForChannel } from "../queries";

export function ChannelSidebar({
  selectedChannelId,
  selectedSessionId,
  onSelectChannel,
  onSelectSession,
}: {
  selectedChannelId: string | null;
  selectedSessionId: string | null;
  onSelectChannel: (id: string) => void;
  onSelectSession: (id: string) => void;
}) {
  const channels = useChannels();
  const createChannel = useCreateChannel();
  const createSession = useCreateSession();
  const sessions = useSessionsForChannel(selectedChannelId);
  const [newName, setNewName] = React.useState("");

  return (
    <div className="flex w-60 flex-col gap-1 bg-[#26262b] p-3 text-sm text-zinc-200">
      <div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">Channels</div>
      {channels.data?.channels.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelectChannel(c.id)}
          className={`rounded px-2 py-1 text-left ${
            selectedChannelId === c.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          # {c.name}
        </button>
      ))}
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          createChannel.mutate({ name: newName.trim() });
          setNewName("");
        }}
      >
        <input
          className="flex-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 placeholder-zinc-500 outline-none"
          placeholder="new channel"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="rounded bg-zinc-700 px-2 hover:bg-zinc-600">+</button>
      </form>

      {selectedChannelId && (
        <>
          <div className="mt-3 text-[10px] uppercase tracking-widest text-zinc-500">Sessions</div>
          {sessions.data?.piSessionIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectSession(id)}
              className={`rounded px-2 py-1 text-left text-xs ${
                selectedSessionId === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
              }`}
              title={id}
            >
              ▸ {id.slice(0, 8)}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              createSession.mutate({ channelId: selectedChannelId, cwd: "/Users/roaanv/mycode/macpi" })
            }
            className="mt-2 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
          >
            + new session (cwd: macpi)
          </button>
        </>
      )}
    </div>
  );
}
```

> **Note:** the "cwd: macpi" hardcode is temporary scaffolding for the foundation milestone. Plan 3 (settings UI) replaces it with the cascade-derived `cwd`.

- [ ] **Step 5: Implement `src/renderer/components/BranchPanel.tsx`**

```tsx
export function BranchPanel() {
  return (
    <div className="w-56 bg-[#22222a] p-3 text-xs text-zinc-400">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Branches</div>
      <div className="text-zinc-500">Branch tree lands in plan 2.</div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/renderer/components/ChatPane.tsx`**

```tsx
import React from "react";
import { onPiHostEvent } from "../ipc";
import { usePromptSession } from "../queries";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const promptMutation = usePromptSession();

  React.useEffect(() => {
    setMessages([]);
    setStreaming(false);
  }, [piSessionId]);

  React.useEffect(() => {
    return onPiHostEvent((ev) => {
      const e = ev as
        | { type: "session.token"; piSessionId: string; delta: string }
        | { type: "session.turn_end"; piSessionId: string };
      if (!piSessionId || e.piSessionId !== piSessionId) return;
      if (e.type === "session.token") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return [...prev.slice(0, -1), { ...last, text: last.text + e.delta }];
          }
          return [...prev, { role: "assistant", text: e.delta }];
        });
      } else if (e.type === "session.turn_end") {
        setStreaming(false);
      }
    });
  }, [piSessionId]);

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
    if (!text || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setStreaming(true);
    try {
      await promptMutation.mutateAsync({ piSessionId, text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: "assistant", text: `[ipc error] ${msg}` }]);
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[#1a1a1f] p-4">
      <div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
        session {piSessionId}
      </div>
      <div className="my-3 flex flex-1 flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className="text-sm leading-relaxed">
            <span className={m.role === "user" ? "text-emerald-300" : "text-amber-300"}>
              {m.role === "user" ? "you" : "pi"}
            </span>
            <span className="text-zinc-500"> · </span>
            <span className="whitespace-pre-wrap">{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 rounded bg-zinc-900 p-2">
        <input
          className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
          placeholder={streaming ? "streaming…" : "Type a message"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
        />
        <button type="submit" className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50" disabled={streaming || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Implement `src/renderer/App.tsx`**

```tsx
import React from "react";
import { ModeRail, type Mode } from "./components/ModeRail";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ChatPane } from "./components/ChatPane";
import { BranchPanel } from "./components/BranchPanel";

export function App() {
  const [mode, setMode] = React.useState<Mode>("chat");
  const [channelId, setChannelId] = React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);

  return (
    <div className="flex h-full">
      <ModeRail mode={mode} onSelect={setMode} />
      <ChannelSidebar
        selectedChannelId={channelId}
        selectedSessionId={sessionId}
        onSelectChannel={(id) => {
          setChannelId(id);
          setSessionId(null);
        }}
        onSelectSession={setSessionId}
      />
      <ChatPane piSessionId={sessionId} />
      <BranchPanel />
    </div>
  );
}
```

- [ ] **Step 8: Update `src/renderer/main.tsx` to import the App**

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 9: Typecheck and start**

```bash
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm start
```

Expected: window opens with three panes. The mode rail is visible (only Chat enabled). The channel list is empty initially. You can type a name and click `+` to create a channel, then click it. The "new session" button creates a session (and may surface a pi auth or model error if Codex is not yet wired).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(renderer): three-pane shell with channel/session sidebar and chat composer"
```

---

## Phase I — End-to-end smoke test

### Task 17: User-facing smoke test against real Codex auth

This is a **manual checkpoint** that closes the foundation milestone. The engineer running the plan should drive it; results go in the commit message.

- [ ] **Step 1: Confirm Codex auth is set up in pi**

```bash
cd /Users/roaanv/mycode/macpi && npx --yes @earendil-works/pi-coding-agent@^0.74 --version
```

If the user hasn't yet authed via the pi CLI, run the auth flow they prefer (Codex API key or OAuth):

```bash
npx --yes @earendil-works/pi-coding-agent@^0.74 auth login codex
```

(Adjust the subcommand if the installed version differs — see `pi --help`.)

Verify:

```bash
ls ~/.pi/agent/auth.json
```

Expected: file exists.

- [ ] **Step 2: Launch macpi**

```bash
cd /Users/roaanv/mycode/macpi && npm start
```

Expected: window opens.

- [ ] **Step 3: Walk the smoke path**

Manually:

1. Type `general` in the new-channel input. Click `+`. The channel `# general` appears.
2. Click the channel.
3. Click `+ new session (cwd: macpi)`. After a moment, a session id appears under `Sessions`.
4. Click the session. The chat pane shows the session id at the top.
5. Type `say "macpi smoke ok"` in the composer. Click `Send`.
6. Watch the assistant bubble fill with streaming tokens.
7. Wait for streaming to stop.

Pass criteria: tokens stream visibly; the assistant responds; no crash.

- [ ] **Step 4: Capture the commit**

```bash
git log --oneline -5
git tag v0.1-foundation -m "macpi foundation milestone — chat MVP against real pi"
```

- [ ] **Step 5: Push tag (only if a remote is configured)**

```bash
git remote -v
# If a remote is set:
git push origin main && git push origin v0.1-foundation
```

If no remote is configured, skip the push and tell the user the tag is local.

---

## Self-review checklist

The plan author has run this checklist. Engineers executing the plan should re-run it after each phase.

- **Spec coverage**:
  - §5 process model → Tasks 4, 12, 13, 14 ✓
  - §6 data model (channels, channel_sessions, settings_*, ui_state) → Task 7 ✓
  - §6.4 settings keys + defaults → Task 8 ✓
  - §6.3 cascade resolver → Task 8 ✓
  - §7 three-pane shell → Task 16 ✓
  - §8 streaming chat (token deltas, send/receive) → Tasks 12, 16; tool blocks deliberately deferred to Plan 2.
  - §11 error handling — partial: IPC `{ok|err}` envelope ✓; crash-loop guard, recovery dialogs, log files deferred to Plan 5 (called out in spec as v1 work; this plan covers the foundation milestone).
  - §12 testing — Layer 1 ✓, Layer 2 ✓; Layer 3 (pi-host with fake provider) deferred to Plan 2 where the richer event surface justifies the harness; Layer 4 (Playwright) deferred to Plan 5.

- **Placeholder scan**: no "TBD", "TODO", "implement later", "fill in details", "appropriate error handling", "similar to Task" present. Every step has the actual content needed.

- **Type consistency**: `IpcMethods`, `IpcResult`, `SettingsValues`, `Channel`, `PiHostInbound/Outbound`, `PiHostEvent`, `ChannelsRepo`, `ChannelSessionsRepo`, `IpcRouter`, `PiHostManager` — names match across all tasks that reference them.

- **Cross-task references**: Tasks 9, 10, 14, 15, 16 all reference earlier tasks correctly. The `ChannelsRepo.create` shape returned in Task 9 matches what the IPC router uses in Task 14 and the test asserts in Task 15.

- **Out-of-scope items**: clearly fenced with "lands in plan 2/3/4/5" comments wherever the foundation defers behavior the spec requires for v1 overall.

- **Pi event names**: verified against `pi/packages/coding-agent/docs/json.md` — `message_update` carries `assistantMessageEvent` (with `type: "text_delta"` for streaming tokens); `turn_end` signals turn completion; `session.sessionId` is the documented getter. If `@earendil-works/pi-coding-agent ^0.74` runtime types diverge, fix in Task 12 against `node_modules/.../dist/index.d.ts` rather than guessing.

---

## Done criteria

The foundation milestone is complete when:

1. All tasks 1–17 are committed.
2. `make test` passes (Layers 1+2).
3. The Task 17 smoke test succeeds against the user's real Codex auth.
4. Tag `v0.1-foundation` exists.

After that: pause, review, then write Plan 2 (Chat richness) against the as-built code. Plan 2's first task wires Layer-3 pi-integration tests with a fake provider — that's where the pi-host harness investment finally pays off.
