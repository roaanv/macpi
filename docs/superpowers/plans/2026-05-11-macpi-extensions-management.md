# Extensions Management (Phase 2 of §10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Extensions list-detail view with a TypeScript editor and Biome-on-save linting, reusing phase-1 infrastructure (resource root, settings, install/remove, import-from-pi, dispose-and-reattach reload).

**Architecture:** A parallel `ExtensionsService` mirrors `SkillsService` (no early abstraction). pi's `DefaultResourceLoader` gets an `extensionsOverride` for the enabled-filter, paralleling phase 1's `skillsOverride`. `pi-import.ts` is extended to copy `~/.pi/extensions/*` (files and directories). A new `biome-runner.ts` in main spawns `npx @biomejs/biome check --reporter=json` and parses output into renderer-safe diagnostics. The renderer adds an `ExtensionsMode` (mode rail entry already exists), a TypeScript-mode CodeMirror editor (reusing the existing wrapper, generalised), and surfaces pi's `LoadExtensionsResult.errors` inline in the list.

**Tech Stack:** Electron 42, React 18, TanStack Query, `@earendil-works/pi-coding-agent` 0.74, CodeMirror 6 (`@codemirror/lang-javascript` new), `@biomejs/biome` (already a dev dep), Vitest 3, Biome v2.

---

## File Structure

**New files (main process):**
- `src/main/extensions-service.ts` — list/read/save/setEnabled/install/remove + lint orchestration.
- `src/main/biome-runner.ts` — spawn `npx @biomejs/biome check --reporter=json`, parse, return diagnostics.
- `src/shared/extensions-types.ts` — `ExtensionSummary`, `ExtensionManifest`, `ExtensionDiagnostic`, `ExtensionLoadError` shapes.

**New files (renderer):**
- `src/renderer/components/ExtensionsMode.tsx` — mode shell (mirrors SkillsMode).
- `src/renderer/components/ExtensionsList.tsx` — list with toolbar + load-error rows.
- `src/renderer/components/ExtensionDetail.tsx` — manifest + editor + Save/Lint buttons + diagnostics panel.
- `src/renderer/components/DiagnosticsPanel.tsx` — collapsible list of Biome diagnostics under the editor.

**Renamed:**
- `src/renderer/components/MarkdownEditor.tsx` → `src/renderer/components/CodeEditor.tsx` — generic over language. Accepts `language: "markdown" | "typescript"` prop.

**Modified files:**
- `src/shared/resource-id.ts` — add `extensionResourceId` symmetric helper.
- `src/main/skills-service.ts` — unify `idFor` to use `sourceInfo.source` (phase-1 fix from final review).
- `src/main/pi-session-manager.ts` — add `loadExtensions` + `buildExtensionsEnabledFilter`; pass `extensionsOverride` to the loader.
- `src/main/pi-import.ts` — copy `extensions/*` (files AND subdirectories recursively); return per-type counts.
- `src/shared/ipc-types.ts` — add 7 new methods; rename `skills.importFromPi` → `resources.importFromPi`.
- `src/main/ipc-router.ts` — register new handlers; update import handler to call `resources.importFromPi`.
- `src/main/index.ts` — wire `ExtensionsService` into router deps.
- `src/renderer/components/ModeRail.tsx` — flip `extensions` to `enabled: true`.
- `src/renderer/App.tsx` — render `<ExtensionsMode>` when `mode === "extensions"`.
- `src/renderer/components/SkillDetail.tsx` — update for `CodeEditor` rename.
- `src/renderer/components/dialogs/ImportFromPiDialog.tsx` — use renamed IPC + show per-type counts.
- `src/renderer/queries.ts` — new mutations/queries; rename `useImportSkillsFromPi` → `useImportResourcesFromPi`; dispatch `macpi:extensions-changed` from extension mutations.
- `src/renderer/state/timeline-state.ts` — also listen for `macpi:extensions-changed`.
- `tests/integration/skills-service.test.ts` — update fixtures to use `sourceInfo` shape.

**Test files (new):**
- `tests/unit/resource-id.test.ts` (extend) — `extensionResourceId` cases.
- `tests/unit/biome-runner.test.ts` — happy path with a temp .ts file containing a known Biome warning; timeout case using a faked spawner.
- `tests/integration/extensions-service.test.ts` — list with loadErrors, read, save, setEnabled, lint via stub runner.

`package.json` adds `@codemirror/lang-javascript`.

---

## Task 1: Phase-1 unification (idFor on `sourceInfo.source`)

**Files:**
- Modify: `src/main/skills-service.ts`
- Modify: `tests/integration/skills-service.test.ts`

The phase-1 final review flagged that `SkillsService.idFor` reads `skill.source?.id` against a fake fixture shape; the real SDK `Skill` has `sourceInfo: { source }`. The `buildSkillsEnabledFilter` (in pi-session-manager) was fixed to use `sourceInfo.source` in commit `8ac4db2`, but the service-side still uses the fake shape. Tests pass because they use fake fixtures.

Phase 2 fixes this so both sides agree.

- [ ] **Step 1: Update fixture shape in tests**

In `tests/integration/skills-service.test.ts`, change the fixture `loadSkills` returns. Replace `{ name: "a", source: { id: "local" }, filePath: ... }` with `{ name: "a", sourceInfo: { source: "local" }, filePath: ... }` for every fixture (4 test cases plus the fileless-skill test).

Update the `PiSkill` interface in the test file (if defined locally) or rely on TS inference.

- [ ] **Step 2: Update `idFor` in SkillsService**

In `src/main/skills-service.ts`, find `idFor`:

```ts
private idFor(skill: PiSkill): { ... } {
    // OLD
    const source = skill.source?.id ?? "local";
```

Replace with:

```ts
private idFor(skill: PiSkill): { ... } {
    const source = skill.sourceInfo?.source ?? "local";
```

Also update the `PiSkill` interface in `src/main/skills-service.ts` if it has a `source?: { id?: string }` field — replace with `sourceInfo?: { source?: string }`.

- [ ] **Step 3: Update `loadSkills` return type in PiSessionManager**

In `src/main/pi-session-manager.ts`, `loadSkills()` currently returns `Array<{ name; source?: { id? }; filePath? }>`. Change to `Array<{ name; sourceInfo?: { source? }; filePath? }>` so callers (SkillsService) see the right shape.

The cast `as Array<...>` at the return site updates accordingly.

- [ ] **Step 4: Update `buildSkillsEnabledFilter` comment**

In `src/main/pi-session-manager.ts`, find the comment block warning about the shape mismatch (around line 144). Remove it now that the mismatch is resolved.

- [ ] **Step 5: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/skills-service.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/main/skills-service.ts src/main/pi-session-manager.ts tests/integration/skills-service.test.ts
cd /Users/roaanv/mycode/macpi && npm run test
```

All pass.

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/skills-service.ts src/main/pi-session-manager.ts tests/integration/skills-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "refactor(skills): unify idFor on real sourceInfo.source shape"
```

---

## Task 2: `extensionResourceId` helper

**Files:**
- Modify: `src/shared/resource-id.ts`
- Modify: `tests/unit/resource-id.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/resource-id.test.ts`:

```ts
describe("extensionResourceId", () => {
	it("formats extension ids", () => {
		expect(
			extensionResourceId({ source: "local", relativePath: "my-ext.ts" }),
		).toBe("extension:local:my-ext.ts");
		expect(
			extensionResourceId({
				source: "git@github.com:x/y.git",
				relativePath: "lib/index.ts",
			}),
		).toBe("extension:git@github.com:x/y.git:lib/index.ts");
	});

	it("parses extension ids back", () => {
		expect(parseResourceId("extension:local:my-ext.ts")).toEqual({
			type: "extension",
			source: "local",
			relativePath: "my-ext.ts",
		});
	});
});
```

Update the import line to include `extensionResourceId`.

- [ ] **Step 2: Add the helper**

In `src/shared/resource-id.ts`, append:

```ts
export function extensionResourceId(opts: {
	source: string;
	relativePath: string;
}): string {
	return `extension:${opts.source}:${opts.relativePath}`;
}
```

- [ ] **Step 3: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/resource-id.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
```

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/resource-id.ts tests/unit/resource-id.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(resource-id): extensionResourceId helper"
```

---

## Task 3: Shared types + ExtensionsService scaffolding

**Files:**
- Create: `src/shared/extensions-types.ts`
- Create: `src/main/extensions-service.ts`
- Create: `tests/integration/extensions-service.test.ts`

This task lands the service surface and the list+read methods. Install/remove/save/setEnabled/lint follow in subsequent tasks.

- [ ] **Step 1: Shared types**

Create `/Users/roaanv/mycode/macpi/src/shared/extensions-types.ts`:

```ts
// Renderer-safe shapes for extensions surfaced over IPC.
// Derived from pi's `Extension` type but trimmed to UI needs.

export interface ExtensionSummary {
	id: string;
	name: string;
	source: string;
	relativePath: string;
	enabled: boolean;
}

export interface ExtensionManifest {
	name: string;
	source: string;
	relativePath: string;
	path: string;  // absolute entry file path on disk
}

export interface ExtensionLoadError {
	path: string;
	error: string;
}

export interface ExtensionDiagnostic {
	severity: "error" | "warn" | "info";
	line: number;
	column: number;
	message: string;
	rule?: string;
}
```

- [ ] **Step 2: Failing integration tests**

Create `tests/integration/extensions-service.test.ts`:

```ts
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/main/db/migrations";
import { ExtensionsService } from "../../src/main/extensions-service";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";

function makeDb() {
	const raw = new DatabaseSync(":memory:");
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	const handle = { raw, close: () => raw.close() };
	runMigrations(handle);
	return handle;
}

describe("ExtensionsService", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-ext-"));
		mkdirSync(path.join(dir, ".macpi/extensions"), { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function makeService(opts: { enabled?: Record<string, boolean> }) {
		const db = makeDb();
		const appSettings = new AppSettingsRepo(db);
		if (opts.enabled) appSettings.set("resourceEnabled", opts.enabled);
		appSettings.set("resourceRoot", path.join(dir, ".macpi"));
		return new ExtensionsService({
			appSettings,
			homeDir: dir,
			loadExtensions: async () => ({
				extensions: [
					{
						path: "a.ts",
						resolvedPath: path.join(dir, ".macpi/extensions/a.ts"),
						sourceInfo: { source: "local" },
					},
					{
						path: "b.ts",
						resolvedPath: path.join(dir, ".macpi/extensions/b.ts"),
						sourceInfo: { source: "local" },
					},
				],
				errors: [{ path: "broken.ts", error: "Parse error: unexpected token" }],
			}),
			loadPackageManager: () => {
				throw new Error("not exercised");
			},
			emitEvent: () => undefined,
			runBiome: () => Promise.resolve([]),
		});
	}

	it("list returns enabled flags + loadErrors", async () => {
		const svc = makeService({
			enabled: {
				"extension:local:a.ts": true,
				"extension:local:b.ts": false,
			},
		});
		const result = await svc.list();
		expect(result.extensions.map((e) => [e.name, e.enabled])).toEqual([
			["a.ts", true],
			["b.ts", false],
		]);
		expect(result.loadErrors).toEqual([
			{ path: "broken.ts", error: "Parse error: unexpected token" },
		]);
	});

	it("list treats missing entries as enabled", async () => {
		const svc = makeService({});
		const result = await svc.list();
		expect(result.extensions.every((e) => e.enabled)).toBe(true);
	});

	it("read returns the entry file body", async () => {
		writeFileSync(
			path.join(dir, ".macpi/extensions/a.ts"),
			"export default () => {}",
		);
		const svc = makeService({});
		const result = await svc.list();
		const detail = await svc.read(result.extensions[0].id);
		expect(detail.body).toBe("export default () => {}");
		expect(detail.manifest.name).toBe("a.ts");
	});

	it("read throws on unknown id", async () => {
		const svc = makeService({});
		await expect(svc.read("extension:local:nope.ts")).rejects.toThrow();
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/extensions-service.test.ts
```
Expected: module not found.

- [ ] **Step 4: Implement the service**

Create `/Users/roaanv/mycode/macpi/src/main/extensions-service.ts`:

```ts
// Reads extensions via pi's DefaultResourceLoader applying our global
// `resourceEnabled` filter. Surfaces pi load errors. Exposes
// list/read/save/setEnabled/install/remove/lint.

import fs from "node:fs";
import path from "node:path";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import { extensionResourceId } from "../shared/resource-id";
import type {
	ExtensionDiagnostic,
	ExtensionLoadError,
	ExtensionManifest,
	ExtensionSummary,
} from "../shared/extensions-types";
import type { PiEvent } from "../shared/pi-events";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiExtension {
	path: string;
	resolvedPath: string;
	sourceInfo?: { source?: string };
}

interface PiExtensionsResult {
	extensions: PiExtension[];
	errors: ExtensionLoadError[];
}

export interface ExtensionsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadExtensions: () => Promise<PiExtensionsResult>;
	loadPackageManager: () => Promise<{
		installAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<void>;
		removeAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<boolean>;
		setProgressCallback: (
			cb:
				| ((e: {
						type: string;
						action: string;
						source: string;
						message?: string;
				  }) => void)
				| undefined,
		) => void;
	}>;
	emitEvent: (e: PiEvent) => void;
	runBiome: (filePath: string) => Promise<ExtensionDiagnostic[]>;
}

export class ExtensionsService {
	constructor(private readonly deps: ExtensionsServiceDeps) {}

	private extensionsRoot(): string {
		return path.join(
			getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir),
			"extensions",
		);
	}

	private idFor(ext: PiExtension): {
		id: string;
		source: string;
		relativePath: string;
	} {
		const source = ext.sourceInfo?.source ?? "local";
		const relativePath = ext.resolvedPath
			? path.relative(this.extensionsRoot(), ext.resolvedPath)
			: ext.path;
		return {
			id: extensionResourceId({ source, relativePath }),
			source,
			relativePath,
		};
	}

	async list(): Promise<{
		extensions: ExtensionSummary[];
		loadErrors: ExtensionLoadError[];
	}> {
		const result = await this.deps.loadExtensions();
		const enabled = getResourceEnabled(this.deps.appSettings.getAll());
		const extensions = result.extensions.map((e) => {
			const ids = this.idFor(e);
			return {
				id: ids.id,
				name: ids.relativePath,
				source: ids.source,
				relativePath: ids.relativePath,
				enabled: enabled[ids.id] !== false,
			};
		});
		return { extensions, loadErrors: result.errors };
	}

	async read(id: string): Promise<{ manifest: ExtensionManifest; body: string }> {
		const result = await this.deps.loadExtensions();
		const target = result.extensions.find((e) => this.idFor(e).id === id);
		if (!target) throw new Error(`extension not found: ${id}`);
		const ids = this.idFor(target);
		const body = target.resolvedPath
			? fs.readFileSync(target.resolvedPath, "utf8")
			: "";
		return {
			manifest: {
				name: ids.relativePath,
				source: ids.source,
				relativePath: ids.relativePath,
				path: target.resolvedPath,
			},
			body,
		};
	}
}
```

- [ ] **Step 5: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/extensions-service.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/shared/extensions-types.ts src/main/extensions-service.ts tests/integration/extensions-service.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/extensions-types.ts src/main/extensions-service.ts tests/integration/extensions-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): ExtensionsService.list + .read with loadErrors"
```

---

## Task 4: `extensions.save` + `extensions.setEnabled`

**Files:**
- Modify: `src/main/extensions-service.ts`
- Modify: `tests/integration/extensions-service.test.ts`

Mirror SkillsService's `save`/`setEnabled`. The IPC routes land in Task 6.

- [ ] **Step 1: Add failing tests**

Append to the `describe("ExtensionsService", ...)` block:

```ts
it("save writes the body to resolvedPath", async () => {
    writeFileSync(path.join(dir, ".macpi/extensions/a.ts"), "old");
    const svc = makeService({});
    const result = await svc.list();
    await svc.save(result.extensions[0].id, "new body");
    expect(
        readFileSync(path.join(dir, ".macpi/extensions/a.ts"), "utf8"),
    ).toBe("new body");
});

it("save throws when the extension has no resolved path", async () => {
    const db = makeDb();
    const appSettings = new AppSettingsRepo(db);
    appSettings.set("resourceRoot", path.join(dir, ".macpi"));
    const svc = new ExtensionsService({
        appSettings,
        homeDir: dir,
        loadExtensions: async () => ({
            extensions: [{ path: "ghost.ts", resolvedPath: "", sourceInfo: { source: "local" } }],
            errors: [],
        }),
        loadPackageManager: () => { throw new Error("not exercised"); },
        emitEvent: () => undefined,
        runBiome: () => Promise.resolve([]),
    });
    const result = await svc.list();
    await expect(svc.save(result.extensions[0].id, "x")).rejects.toThrow();
});

it("setEnabled persists the flag", async () => {
    const svc = makeService({});
    const result = await svc.list();
    await svc.setEnabled(result.extensions[0].id, false);
    const after = await svc.list();
    expect(
        after.extensions.find((e) => e.id === result.extensions[0].id)?.enabled,
    ).toBe(false);
});
```

- [ ] **Step 2: Implement**

Add to `ExtensionsService`:

```ts
async save(id: string, body: string): Promise<void> {
    const result = await this.deps.loadExtensions();
    const target = result.extensions.find((e) => this.idFor(e).id === id);
    if (!target?.resolvedPath) {
        throw new Error(`extension not found or has no file: ${id}`);
    }
    fs.writeFileSync(target.resolvedPath, body);
}

async setEnabled(id: string, enabled: boolean): Promise<void> {
    const current = getResourceEnabled(this.deps.appSettings.getAll());
    const next = { ...current, [id]: enabled };
    this.deps.appSettings.set("resourceEnabled", next);
}
```

- [ ] **Step 3: Run tests + gates**

Expected: 3 new tests pass; full suite green.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/extensions-service.ts tests/integration/extensions-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): save + setEnabled"
```

---

## Task 5: `extensions.install` + `extensions.remove`

**Files:**
- Modify: `src/main/extensions-service.ts`

Same pattern as `SkillsService.install/remove` — wires `setProgressCallback` to emit `package.progress` events. No new tests; install/remove are smoke-validated.

- [ ] **Step 1: Add methods**

In `ExtensionsService`, add:

```ts
async install(source: string): Promise<void> {
    const pm = await this.deps.loadPackageManager();
    pm.setProgressCallback((e) => {
        this.deps.emitEvent({
            type: "package.progress",
            action: e.action as
                | "install"
                | "remove"
                | "update"
                | "clone"
                | "pull",
            source: e.source,
            phase: e.type as "start" | "progress" | "complete" | "error",
            message: e.message,
        });
    });
    try {
        await pm.installAndPersist(source, { local: false });
    } finally {
        pm.setProgressCallback(undefined);
    }
}

async remove(source: string): Promise<void> {
    const pm = await this.deps.loadPackageManager();
    await pm.removeAndPersist(source, { local: false });
}
```

- [ ] **Step 2: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/extensions-service.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): install + remove with progress events"
```

---

## Task 6: `extensions.*` IPC methods + handlers

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/pi-session-manager.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Add IPC methods**

In `src/shared/ipc-types.ts`, add an import for the shared types:

```ts
import type {
    ExtensionDiagnostic,
    ExtensionLoadError,
    ExtensionManifest,
    ExtensionSummary,
} from "./extensions-types";
```

Add to `IpcMethods`:

```ts
"extensions.list": {
    req: Record<string, never>;
    res: { extensions: ExtensionSummary[]; loadErrors: ExtensionLoadError[] };
};
"extensions.read": {
    req: { id: string };
    res: { manifest: ExtensionManifest; body: string };
};
"extensions.save": {
    req: { id: string; body: string };
    res: Record<string, never>;
};
"extensions.setEnabled": {
    req: { id: string; enabled: boolean };
    res: Record<string, never>;
};
"extensions.install": {
    req: { source: string };
    res: Record<string, never>;
};
"extensions.remove": {
    req: { source: string };
    res: Record<string, never>;
};
```

(`extensions.lint` lands in Task 9.)

- [ ] **Step 2: Add `loadExtensions` method to PiSessionManager**

In `src/main/pi-session-manager.ts`, add a public method near `loadSkills`:

```ts
async loadExtensions(): Promise<{
    extensions: Array<{ path: string; resolvedPath: string; sourceInfo?: { source?: string } }>;
    errors: Array<{ path: string; error: string }>;
}> {
    if (!this.deps) {
        throw new Error("PiSessionManager requires deps for loadExtensions");
    }
    const ctx = await this.ensureContext();
    const agentDir = ensureResourceRoot(
        this.deps.appSettings.getAll(),
        this.deps.homeDir,
    );
    // No extensionsOverride here — UI shows ALL extensions (incl. disabled).
    const loader = new ctx.mod.DefaultResourceLoader({
        cwd: this.deps.homeDir,
        agentDir,
    });
    const result = loader.getExtensions();
    return {
        extensions: result.extensions as Array<{
            path: string;
            resolvedPath: string;
            sourceInfo?: { source?: string };
        }>,
        errors: result.errors,
    };
}
```

- [ ] **Step 3: Wire ExtensionsService in `src/main/index.ts`**

```ts
import { ExtensionsService } from "./extensions-service";
import { runBiomeCheck } from "./biome-runner";  // not yet created — placeholder import in Task 8
// ...
const extensionsService = new ExtensionsService({
    appSettings,
    homeDir: os.homedir(),
    loadExtensions: () => manager.loadExtensions(),
    loadPackageManager: () => manager.loadPackageManager(),
    emitEvent: (event) => manager.broadcastEvent(event),
    runBiome: (filePath) => runBiomeCheck(filePath),  // wired in Task 8
});
```

(For now, pass a stub `runBiome: () => Promise.resolve([])` — Task 8 swaps it for the real call.)

Pass `extensionsService` into `IpcRouter` deps.

- [ ] **Step 4: Extend `RouterDeps` + register handlers**

In `src/main/ipc-router.ts`:

```ts
import type { ExtensionsService } from "./extensions-service";
// Add to RouterDeps:
extensionsService: ExtensionsService;
```

Register handlers (near the `skills.*` handlers):

```ts
this.register("extensions.list", async () => {
    return ok(await this.deps.extensionsService.list());
});
this.register("extensions.read", async (args) => {
    try {
        return ok(await this.deps.extensionsService.read(args.id));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        throw e;
    }
});
this.register("extensions.save", async (args) => {
    try {
        await this.deps.extensionsService.save(args.id, args.body);
        return ok({});
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        throw e;
    }
});
this.register("extensions.setEnabled", async (args) => {
    await this.deps.extensionsService.setEnabled(args.id, args.enabled);
    return ok({});
});
this.register("extensions.install", async (args) => {
    try {
        await this.deps.extensionsService.install(args.source);
        return ok({});
    } catch (e) {
        return err("install_failed", e instanceof Error ? e.message : String(e));
    }
});
this.register("extensions.remove", async (args) => {
    try {
        await this.deps.extensionsService.remove(args.source);
        return ok({});
    } catch (e) {
        return err("remove_failed", e instanceof Error ? e.message : String(e));
    }
});
```

- [ ] **Step 5: Update ipc-router test stub**

In `tests/integration/ipc-router.test.ts`, add a stub:

```ts
const extensionsServiceStub = {
    list: vi.fn().mockResolvedValue({ extensions: [], loadErrors: [] }),
    read: vi.fn().mockResolvedValue({
        manifest: { name: "x", source: "local", relativePath: "x.ts", path: "" },
        body: "",
    }),
    save: vi.fn().mockResolvedValue(undefined),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
};
```

Pass into the router: `extensionsService: extensionsServiceStub as unknown as ExtensionsService`.

- [ ] **Step 6: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npm run test
```

All pass.

- [ ] **Step 7: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(ipc): extensions.list/read/save/setEnabled/install/remove"
```

---

## Task 7: Wire `extensionsOverride` into per-session loader

**Files:**
- Modify: `src/main/pi-session-manager.ts`

Mirrors phase 1's `buildSkillsEnabledFilter` — the per-session `DefaultResourceLoader` filters out disabled extensions so pi doesn't load them.

- [ ] **Step 1: Add the filter**

In `src/main/pi-session-manager.ts`, add an import:

```ts
import { extensionResourceId, skillResourceId } from "../shared/resource-id";
```

(Update the existing `skillResourceId` import line — both helpers live in the same module.)

Also import `Extension` type:

```ts
import type {
    // existing imports...
    Extension,
} from "@earendil-works/pi-coding-agent";
```

Add a method:

```ts
private buildExtensionsEnabledFilter(
    agentDir: string,
): (base: {
    extensions: Extension[];
    errors: Array<{ path: string; error: string }>;
    runtime: unknown;
}) => {
    extensions: Extension[];
    errors: Array<{ path: string; error: string }>;
    runtime: unknown;
} {
    const settings = this.deps?.appSettings.getAll() ?? {};
    const enabled = getResourceEnabled(settings);
    const extensionsRoot = path.join(agentDir, "extensions");
    return (base) => ({
        extensions: base.extensions.filter((e) => {
            const source = e.sourceInfo?.source ?? "local";
            const relativePath = e.resolvedPath
                ? path.relative(extensionsRoot, e.resolvedPath)
                : e.path;
            const id = extensionResourceId({ source, relativePath });
            return enabled[id] !== false;
        }),
        errors: base.errors,
        runtime: base.runtime,
    });
}
```

(The `runtime: unknown` reflects pi's `ExtensionRuntime` type — we don't touch it, just pass it through.)

- [ ] **Step 2: Use it in `buildResourceLoader`**

Update `buildResourceLoader`:

```ts
return new ctx.mod.DefaultResourceLoader({
    cwd,
    agentDir,
    skillsOverride: this.buildSkillsEnabledFilter(agentDir),
    extensionsOverride: this.buildExtensionsEnabledFilter(agentDir),  // new
});
```

- [ ] **Step 3: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run test
```

All pass.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/pi-session-manager.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(pi): extensionsOverride filter via resourceEnabled"
```

---

## Task 8: Biome runner

**Files:**
- Create: `src/main/biome-runner.ts`
- Create: `tests/unit/biome-runner.test.ts`
- Modify: `src/main/index.ts` (swap stub for real `runBiomeCheck`)

- [ ] **Step 1: Write the failing test**

Create `/Users/roaanv/mycode/macpi/tests/unit/biome-runner.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setSpawnerForTesting, runBiomeCheck } from "../../src/main/biome-runner";

describe("runBiomeCheck", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-biome-"));
	});
	afterEach(() => {
		__setSpawnerForTesting(null);
		rmSync(dir, { recursive: true, force: true });
	});

	it("parses Biome JSON diagnostics into ExtensionDiagnostic[]", async () => {
		__setSpawnerForTesting(() =>
			Promise.resolve({
				stdout: JSON.stringify({
					diagnostics: [
						{
							severity: "warning",
							message: { content: [{ content: "Unused variable" }] },
							location: { span: { start: { line: 2, column: 5 } } },
							category: "lint/correctness/noUnusedVariables",
						},
					],
				}),
				stderr: "",
				code: 0,
			}),
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "const x = 1;\n");
		const diags = await runBiomeCheck(file);
		expect(diags).toEqual([
			expect.objectContaining({
				severity: "warn",
				line: 2,
				column: 5,
				message: "Unused variable",
				rule: "lint/correctness/noUnusedVariables",
			}),
		]);
	});

	it("returns a single error diagnostic on timeout", async () => {
		__setSpawnerForTesting(
			() => new Promise(() => undefined), // never resolves
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "");
		const diags = await runBiomeCheck(file, 50);
		expect(diags).toHaveLength(1);
		expect(diags[0]).toEqual(
			expect.objectContaining({
				severity: "error",
				message: expect.stringMatching(/timeout/i),
			}),
		);
	});

	it("returns a single error diagnostic on non-JSON stdout", async () => {
		__setSpawnerForTesting(() =>
			Promise.resolve({ stdout: "not json", stderr: "", code: 0 }),
		);
		const file = path.join(dir, "a.ts");
		writeFileSync(file, "");
		const diags = await runBiomeCheck(file);
		expect(diags).toHaveLength(1);
		expect(diags[0].severity).toBe("error");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/biome-runner.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement**

Create `/Users/roaanv/mycode/macpi/src/main/biome-runner.ts`:

```ts
// Spawns `npx @biomejs/biome check --reporter=json <file>` and parses the
// output into renderer-safe ExtensionDiagnostic[]. Errors (Biome missing,
// non-JSON output, timeout) are surfaced as a single error diagnostic so
// the UI always renders something useful.

import { spawn } from "node:child_process";
import type { ExtensionDiagnostic } from "../shared/extensions-types";

interface SpawnResult {
	stdout: string;
	stderr: string;
	code: number;
}

type Spawner = (file: string) => Promise<SpawnResult>;

const realSpawner: Spawner = (file) =>
	new Promise((resolve) => {
		const proc = spawn(
			"npx",
			["@biomejs/biome", "check", "--reporter=json", file],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		proc.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		proc.on("close", (code) => {
			resolve({ stdout, stderr, code: code ?? -1 });
		});
		proc.on("error", () => {
			resolve({ stdout: "", stderr: "biome spawn failed", code: -1 });
		});
	});

let spawner: Spawner | null = null;

/** Test-only hook. Production code uses the real spawner. */
export function __setSpawnerForTesting(s: Spawner | null): void {
	spawner = s;
}

export async function runBiomeCheck(
	filePath: string,
	timeoutMs = 5000,
): Promise<ExtensionDiagnostic[]> {
	const spawn = spawner ?? realSpawner;
	let timedOut = false;
	const timer = new Promise<SpawnResult>((resolve) =>
		setTimeout(() => {
			timedOut = true;
			resolve({ stdout: "", stderr: "timeout", code: -1 });
		}, timeoutMs),
	);
	const result = await Promise.race([spawn(filePath), timer]);
	if (timedOut) {
		return [
			{
				severity: "error",
				line: 0,
				column: 0,
				message: `Biome lint timeout after ${timeoutMs}ms`,
			},
		];
	}
	try {
		const parsed = JSON.parse(result.stdout) as {
			diagnostics?: Array<{
				severity?: string;
				message?: { content?: Array<{ content?: string }> };
				location?: { span?: { start?: { line?: number; column?: number } } };
				category?: string;
			}>;
		};
		if (!parsed.diagnostics) return [];
		return parsed.diagnostics.map((d) => ({
			severity: mapSeverity(d.severity),
			line: d.location?.span?.start?.line ?? 0,
			column: d.location?.span?.start?.column ?? 0,
			message: extractMessage(d.message) ?? "(no message)",
			rule: d.category,
		}));
	} catch {
		return [
			{
				severity: "error",
				line: 0,
				column: 0,
				message: `Biome output parse failed (stderr: ${result.stderr.slice(0, 200)})`,
			},
		];
	}
}

function mapSeverity(s: string | undefined): ExtensionDiagnostic["severity"] {
	if (s === "error" || s === "fatal") return "error";
	if (s === "warning" || s === "warn") return "warn";
	return "info";
}

function extractMessage(m: {
	content?: Array<{ content?: string }>;
} | undefined): string | undefined {
	if (!m?.content) return undefined;
	return m.content.map((c) => c.content ?? "").join("");
}
```

- [ ] **Step 4: Swap the stub in `index.ts`**

In `src/main/index.ts`, the ExtensionsService construction from Task 6 had `runBiome: () => Promise.resolve([])`. Replace with `runBiome: (filePath) => runBiomeCheck(filePath)`.

Add: `import { runBiomeCheck } from "./biome-runner";`

- [ ] **Step 5: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/biome-runner.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/main/biome-runner.ts src/main/index.ts tests/unit/biome-runner.test.ts
cd /Users/roaanv/mycode/macpi && npm run test
```

Expected: 3 new tests pass.

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/biome-runner.ts src/main/index.ts tests/unit/biome-runner.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): Biome runner via npx + JSON reporter"
```

---

## Task 9: `extensions.lint` IPC + ExtensionsService.lint

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/extensions-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/extensions-service.test.ts`

- [ ] **Step 1: Add to IPC**

In `src/shared/ipc-types.ts`:

```ts
"extensions.lint": {
    req: { id: string };
    res: { diagnostics: ExtensionDiagnostic[] };
};
```

- [ ] **Step 2: Add ExtensionsService.lint**

Add to the class:

```ts
async lint(id: string): Promise<ExtensionDiagnostic[]> {
    const result = await this.deps.loadExtensions();
    const target = result.extensions.find((e) => this.idFor(e).id === id);
    if (!target?.resolvedPath) {
        throw new Error(`extension not found or has no file: ${id}`);
    }
    return this.deps.runBiome(target.resolvedPath);
}
```

- [ ] **Step 3: Add test**

Append to `tests/integration/extensions-service.test.ts`:

```ts
it("lint forwards to the injected biome runner", async () => {
    writeFileSync(path.join(dir, ".macpi/extensions/a.ts"), "const x = 1;");
    const db = makeDb();
    const appSettings = new AppSettingsRepo(db);
    appSettings.set("resourceRoot", path.join(dir, ".macpi"));
    const runBiome = vi.fn().mockResolvedValue([
        {
            severity: "warn",
            line: 1,
            column: 7,
            message: "Unused variable",
            rule: "lint/correctness/noUnusedVariables",
        },
    ]);
    const svc = new ExtensionsService({
        appSettings,
        homeDir: dir,
        loadExtensions: async () => ({
            extensions: [
                {
                    path: "a.ts",
                    resolvedPath: path.join(dir, ".macpi/extensions/a.ts"),
                    sourceInfo: { source: "local" },
                },
            ],
            errors: [],
        }),
        loadPackageManager: () => { throw new Error("not exercised"); },
        emitEvent: () => undefined,
        runBiome,
    });
    const result = await svc.list();
    const diags = await svc.lint(result.extensions[0].id);
    expect(runBiome).toHaveBeenCalledWith(
        path.join(dir, ".macpi/extensions/a.ts"),
    );
    expect(diags).toHaveLength(1);
});
```

Add `vi` to the vitest import line.

- [ ] **Step 4: Register handler**

In `src/main/ipc-router.ts`:

```ts
this.register("extensions.lint", async (args) => {
    try {
        const diagnostics = await this.deps.extensionsService.lint(args.id);
        return ok({ diagnostics });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("not found")) return err("not_found", msg);
        throw e;
    }
});
```

Add the stub to ipc-router.test.ts: `lint: vi.fn().mockResolvedValue([])`.

- [ ] **Step 5: Run gates**

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): lint IPC via injected Biome runner"
```

---

## Task 10: Generalise editor — `CodeEditor` over `MarkdownEditor`

**Files:**
- Rename: `src/renderer/components/MarkdownEditor.tsx` → `src/renderer/components/CodeEditor.tsx`
- Modify: `src/renderer/components/SkillDetail.tsx` (update import)
- Modify: `package.json` (add `@codemirror/lang-javascript`)

- [ ] **Step 1: Install the JS lang pack**

```
cd /Users/roaanv/mycode/macpi && npm install --save @codemirror/lang-javascript
```

- [ ] **Step 2: Rename + generalise the editor**

`git mv src/renderer/components/MarkdownEditor.tsx src/renderer/components/CodeEditor.tsx`.

In the renamed file, replace the imports:

```ts
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
```

Add a `language` prop:

```tsx
interface CodeEditorProps {
    value: string;
    onChange: (next: string) => void;
    language: "markdown" | "typescript";
}

export function CodeEditor({ value, onChange, language }: CodeEditorProps) {
    // ...
    const langExtension = language === "typescript" ? javascript({ typescript: true }) : markdown();
    // ...
    extensions: [
        lineNumbers(),
        history(),
        langExtension,   // was `markdown()`
        keymap.of(...),
        // ...
    ],
```

Update the function name `MarkdownEditor` to `CodeEditor` throughout.

- [ ] **Step 3: Update SkillDetail import**

In `src/renderer/components/SkillDetail.tsx`, replace:

```tsx
import { MarkdownEditor } from "./MarkdownEditor";
// ...
<MarkdownEditor value={draft} onChange={setDraft} />
```

with:

```tsx
import { CodeEditor } from "./CodeEditor";
// ...
<CodeEditor value={draft} onChange={setDraft} language="markdown" />
```

- [ ] **Step 4: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/CodeEditor.tsx src/renderer/components/SkillDetail.tsx
cd /Users/roaanv/mycode/macpi && npm run test
```

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u package.json package-lock.json
cd /Users/roaanv/mycode/macpi && git commit -m "refactor(editor): generalise MarkdownEditor to CodeEditor with language prop"
```

---

## Task 11: Mode rail + ExtensionsMode shell

**Files:**
- Modify: `src/renderer/components/ModeRail.tsx` (flip `extensions` to `enabled: true`)
- Create: `src/renderer/components/ExtensionsMode.tsx`
- Create: `src/renderer/components/ExtensionsList.tsx` (stub)
- Create: `src/renderer/components/ExtensionDetail.tsx` (stub)
- Modify: `src/renderer/App.tsx` (render the mode)

- [ ] **Step 1: Flip mode rail**

In `ModeRail.tsx`, change `{ mode: "extensions", enabled: false }` to `enabled: true`.

- [ ] **Step 2: Stub `ExtensionsList`**

```tsx
// src/renderer/components/ExtensionsList.tsx — Task 12 fills this in.
interface ExtensionsListProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onInstall: () => void;
    onImport: () => void;
}
export function ExtensionsList(_props: ExtensionsListProps) {
    return (
        <aside className="w-64 surface-rail border-r border-divider p-2 text-muted text-xs">
            Extensions list (coming in task 12)
        </aside>
    );
}
```

- [ ] **Step 3: Stub `ExtensionDetail`**

```tsx
// src/renderer/components/ExtensionDetail.tsx — Task 13 fills this in.
export function ExtensionDetail({ id }: { id: string | null }) {
    return (
        <section className="flex-1 surface-panel p-6 text-muted text-sm">
            {id ? `Detail for ${id}` : "Select an extension."}
        </section>
    );
}
```

- [ ] **Step 4: Create `ExtensionsMode`**

```tsx
// src/renderer/components/ExtensionsMode.tsx
import React from "react";
import { ExtensionDetail } from "./ExtensionDetail";
import { ExtensionsList } from "./ExtensionsList";
import { InstallSkillDialog } from "./dialogs/InstallSkillDialog";
import { ImportFromPiDialog } from "./dialogs/ImportFromPiDialog";

// We reuse the install dialog (works for any source via pi's package
// manager). The shape is the same — only the source string differs.
// For phase 2 we add an "extensions" tag to differentiate refresh behavior
// (next task wires this).

export function ExtensionsMode() {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [installOpen, setInstallOpen] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(false);
    return (
        <>
            <ExtensionsList
                selectedId={selectedId}
                onSelect={setSelectedId}
                onInstall={() => setInstallOpen(true)}
                onImport={() => setImportOpen(true)}
            />
            <ExtensionDetail id={selectedId} />
            <InstallSkillDialog
                open={installOpen}
                onClose={() => setInstallOpen(false)}
                resourceKind="extension"
            />
            <ImportFromPiDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
            />
        </>
    );
}
```

`InstallSkillDialog` now needs a `resourceKind?: "skill" | "extension"` prop — defaulting to `"skill"` for backward compat. Task 12 generalises it (and updates `SkillsMode` to pass `"skill"`).

- [ ] **Step 5: Render the mode in App.tsx**

In `src/renderer/App.tsx`:

```tsx
import { ExtensionsMode } from "./components/ExtensionsMode";
// ...
{mode === "extensions" && <ExtensionsMode />}
```

- [ ] **Step 6: Add `resourceKind` prop to InstallSkillDialog**

In `src/renderer/components/dialogs/InstallSkillDialog.tsx`:

```tsx
interface InstallSkillDialogProps {
    open: boolean;
    onClose: () => void;
    resourceKind?: "skill" | "extension";  // defaults to "skill"
}
```

In the body, branch the mutation:

```tsx
const installSkill = useInstallSkill();
const installExtension = useInstallExtension();  // added in Task 12 queries.ts
const install = resourceKind === "extension" ? installExtension : installSkill;
```

(For Task 11 alone, `useInstallExtension` doesn't exist yet — guard the import to avoid breaking the build. Add a placeholder export in `queries.ts`:)

```ts
// queries.ts — placeholder until Task 12 wires the list invalidation
export function useInstallExtension() {
    return useInstallSkill();
}
```

Update SkillsMode to pass `resourceKind="skill"` explicitly (or rely on default).

- [ ] **Step 7: Run gates**

- [ ] **Step 8: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): enable extensions mode with shell components"
```

---

## Task 12: ExtensionsList real implementation

**Files:**
- Modify: `src/renderer/components/ExtensionsList.tsx`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Queries**

In `src/renderer/queries.ts`:

```ts
export function useExtensions() {
    return useQuery({
        queryKey: ["extensions.list"],
        queryFn: () => invoke("extensions.list", {}),
    });
}

export function useSetExtensionEnabled() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; enabled: boolean }) =>
            invoke("extensions.setEnabled", input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["extensions.list"] });
            window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
        },
    });
}

// Replace the placeholder from Task 11:
export function useInstallExtension() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { source: string }) =>
            invoke("extensions.install", input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["extensions.list"] });
            window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
        },
    });
}
```

- [ ] **Step 2: Implement the list**

In `src/renderer/components/ExtensionsList.tsx`, replace the stub:

```tsx
import { useExtensions, useSetExtensionEnabled } from "../queries";

interface ExtensionsListProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onInstall: () => void;
    onImport: () => void;
}

export function ExtensionsList({
    selectedId,
    onSelect,
    onInstall,
    onImport,
}: ExtensionsListProps) {
    const ext = useExtensions();
    const setEnabled = useSetExtensionEnabled();
    return (
        <aside className="flex w-64 flex-col surface-rail border-r border-divider">
            <div className="flex gap-2 border-b border-divider p-2">
                <button
                    type="button"
                    onClick={onInstall}
                    className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
                >
                    + Install…
                </button>
                <button
                    type="button"
                    onClick={onImport}
                    className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
                >
                    Import from ~/.pi
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
                {ext.isLoading && (
                    <div className="p-2 text-xs text-muted">Loading…</div>
                )}
                {ext.data?.loadErrors.map((e) => (
                    <div
                        key={e.path}
                        className="rounded border-l-2 border-red-500 bg-red-500/10 px-2 py-1 text-xs text-red-200"
                    >
                        <div className="font-semibold">⚠ {e.path}</div>
                        <div className="truncate text-[10px]">{e.error}</div>
                    </div>
                ))}
                {ext.data &&
                    ext.data.extensions.length === 0 &&
                    ext.data.loadErrors.length === 0 && (
                        <div className="p-2 text-xs text-muted">
                            No extensions yet. Install or import from ~/.pi.
                        </div>
                    )}
                {ext.data?.extensions.map((e) => (
                    <div
                        key={e.id}
                        className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === e.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
                    >
                        <input
                            type="checkbox"
                            checked={e.enabled}
                            onChange={(evt) =>
                                setEnabled.mutate({
                                    id: e.id,
                                    enabled: evt.target.checked,
                                })
                            }
                            aria-label={`Enable ${e.name}`}
                        />
                        <button
                            type="button"
                            onClick={() => onSelect(e.id)}
                            className="flex-1 truncate text-left"
                        >
                            {e.name}
                            <span className="ml-2 text-[10px] text-muted">
                                {e.source}
                            </span>
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
```

- [ ] **Step 3: Run gates + commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): list view with toolbar + load-error rows"
```

---

## Task 13: ExtensionDetail with editor + Save + Lint + diagnostics panel

**Files:**
- Modify: `src/renderer/components/ExtensionDetail.tsx`
- Create: `src/renderer/components/DiagnosticsPanel.tsx`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Queries**

In `src/renderer/queries.ts`:

```ts
export function useExtensionDetail(id: string | null) {
    return useQuery({
        queryKey: ["extensions.read", id],
        queryFn: () =>
            id
                ? invoke("extensions.read", { id })
                : Promise.reject(new Error("no id")),
        enabled: id !== null,
    });
}

export function useSaveExtension() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; body: string }) =>
            invoke("extensions.save", input),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["extensions.read", vars.id] });
            window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
        },
    });
}

export function useLintExtension() {
    return useMutation({
        mutationFn: (input: { id: string }) =>
            invoke("extensions.lint", input),
    });
}
```

- [ ] **Step 2: DiagnosticsPanel**

Create `src/renderer/components/DiagnosticsPanel.tsx`:

```tsx
import React from "react";
import type { ExtensionDiagnostic } from "../../shared/extensions-types";

interface DiagnosticsPanelProps {
    diagnostics: ExtensionDiagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
    const [collapsed, setCollapsed] = React.useState(
        diagnostics.every((d) => d.severity !== "error"),
    );
    if (diagnostics.length === 0) return null;

    const counts = diagnostics.reduce(
        (acc, d) => ({ ...acc, [d.severity]: (acc[d.severity] ?? 0) + 1 }),
        {} as Record<string, number>,
    );

    return (
        <div className="border-t border-divider text-xs">
            <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="flex w-full items-center gap-2 px-2 py-1 text-left surface-row hover:opacity-80"
            >
                <span>{collapsed ? "▸" : "▾"}</span>
                <span className="font-semibold">Diagnostics</span>
                {counts.error && (
                    <span className="text-red-300">{counts.error} error{counts.error > 1 && "s"}</span>
                )}
                {counts.warn && (
                    <span className="text-amber-300">{counts.warn} warning{counts.warn > 1 && "s"}</span>
                )}
            </button>
            {!collapsed && (
                <div className="max-h-40 overflow-y-auto p-2">
                    {diagnostics.map((d, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: diagnostic rows have no stable id
                        <div
                            key={i}
                            className={`flex gap-2 px-1 py-0.5 ${d.severity === "error" ? "text-red-300" : d.severity === "warn" ? "text-amber-300" : "text-muted"}`}
                        >
                            <span className="font-mono text-[10px]">
                                {d.line}:{d.column}
                            </span>
                            <span className="flex-1">{d.message}</span>
                            {d.rule && (
                                <span className="text-[10px] text-muted">
                                    {d.rule}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Detail view**

Replace `src/renderer/components/ExtensionDetail.tsx`:

```tsx
import React from "react";
import {
    useExtensionDetail,
    useLintExtension,
    useSaveExtension,
} from "../queries";
import { CodeEditor } from "./CodeEditor";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { ExtensionDiagnostic } from "../../shared/extensions-types";

interface ExtensionDetailProps {
    id: string | null;
}

export function ExtensionDetail({ id }: ExtensionDetailProps) {
    const detail = useExtensionDetail(id);
    const save = useSaveExtension();
    const lint = useLintExtension();
    const [draft, setDraft] = React.useState("");
    const [diagnostics, setDiagnostics] = React.useState<ExtensionDiagnostic[]>([]);

    React.useEffect(() => {
        if (detail.data) {
            setDraft(detail.data.body);
            setDiagnostics([]);
        }
    }, [detail.data]);

    if (!id) {
        return (
            <section className="flex-1 surface-panel p-6 text-sm text-muted">
                Select an extension on the left to view or edit it.
            </section>
        );
    }
    if (detail.isLoading) {
        return (
            <section className="flex-1 surface-panel p-6 text-sm text-muted">
                Loading…
            </section>
        );
    }
    if (detail.isError || !detail.data) {
        return (
            <section className="flex-1 surface-panel p-6 text-sm text-red-300">
                {(detail.error as Error)?.message ?? "Extension not found."}
            </section>
        );
    }

    const dirty = draft !== detail.data.body;

    const handleSave = () => {
        if (!id) return;
        save.mutate(
            { id, body: draft },
            {
                onSuccess: () => {
                    // Auto-lint after save.
                    lint.mutate(
                        { id },
                        {
                            onSuccess: (r) => setDiagnostics(r.diagnostics),
                        },
                    );
                },
            },
        );
    };

    const handleLint = () => {
        if (!id) return;
        lint.mutate(
            { id },
            { onSuccess: (r) => setDiagnostics(r.diagnostics) },
        );
    };

    return (
        <section className="flex flex-1 flex-col surface-panel">
            <header className="border-b border-divider p-3">
                <div className="text-sm font-semibold text-primary">
                    {detail.data.manifest.name}
                </div>
                <div className="text-xs text-muted">
                    {detail.data.manifest.source} ·{" "}
                    {detail.data.manifest.relativePath}
                </div>
            </header>
            <CodeEditor value={draft} onChange={setDraft} language="typescript" />
            <footer className="flex items-center justify-end gap-2 border-t border-divider p-2">
                {dirty && (
                    <span className="text-xs text-amber-300">• unsaved</span>
                )}
                <button
                    type="button"
                    onClick={handleLint}
                    disabled={lint.isPending}
                    className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
                >
                    {lint.isPending ? "Linting…" : "Lint"}
                </button>
                <button
                    type="button"
                    disabled={!dirty || save.isPending}
                    onClick={handleSave}
                    className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
                >
                    {save.isPending ? "Saving…" : "Save"}
                </button>
            </footer>
            <DiagnosticsPanel diagnostics={diagnostics} />
        </section>
    );
}
```

- [ ] **Step 4: Run gates + commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(extensions): detail view with TS editor + Save + Lint"
```

---

## Task 14: Extend `pi-import` for extensions + rename IPC

**Files:**
- Modify: `src/main/pi-import.ts`
- Modify: `tests/unit/pi-import.test.ts`
- Modify: `src/main/skills-service.ts` (importFromPi delegates to a shared helper)
- Create: `src/main/extensions-service.ts` (already exists — add `importFromPi`)
- Modify: `src/shared/ipc-types.ts` (rename `skills.importFromPi` → `resources.importFromPi`)
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/dialogs/ImportFromPiDialog.tsx`

- [ ] **Step 1: Extend pi-import**

Replace `src/main/pi-import.ts`:

```ts
// Copies top-level skills + extensions from a pi installation into macpi's
// resource root. Skip-if-exists; never overwrites. For extensions, copies
// directories recursively. Returns per-type counts.

import fs from "node:fs";
import path from "node:path";

export interface PiImportInput {
    piRoot: string;
    macpiRoot: string;
}

export interface PiImportResult {
    skills: { copied: number; skipped: number };
    extensions: { copied: number; skipped: number };
}

export function importResourcesFromPi(input: PiImportInput): PiImportResult {
    return {
        skills: copyDir(
            path.join(input.piRoot, "skills"),
            path.join(input.macpiRoot, "skills"),
            { filesOnly: true },
        ),
        extensions: copyDir(
            path.join(input.piRoot, "extensions"),
            path.join(input.macpiRoot, "extensions"),
            { filesOnly: false },
        ),
    };
}

function copyDir(
    src: string,
    dst: string,
    opts: { filesOnly: boolean },
): { copied: number; skipped: number } {
    if (!fs.existsSync(src)) return { copied: 0, skipped: 0 };
    fs.mkdirSync(dst, { recursive: true });
    let copied = 0;
    let skipped = 0;
    for (const name of fs.readdirSync(src)) {
        const srcEntry = path.join(src, name);
        const dstEntry = path.join(dst, name);
        const stat = fs.statSync(srcEntry);
        if (stat.isFile()) {
            if (fs.existsSync(dstEntry)) {
                skipped++;
                continue;
            }
            fs.copyFileSync(srcEntry, dstEntry);
            copied++;
        } else if (stat.isDirectory()) {
            if (opts.filesOnly) continue;
            if (fs.existsSync(dstEntry)) {
                skipped++;
                continue;
            }
            copyDirRecursive(srcEntry, dstEntry);
            copied++;
        }
    }
    return { copied, skipped };
}

function copyDirRecursive(src: string, dst: string): void {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
        const s = path.join(src, name);
        const d = path.join(dst, name);
        const stat = fs.statSync(s);
        if (stat.isFile()) fs.copyFileSync(s, d);
        else if (stat.isDirectory()) copyDirRecursive(s, d);
    }
}

// Backward-compat alias for any caller still using the skills-only entry point.
export function importSkillsFromPi(input: PiImportInput): {
    copied: number;
    skipped: number;
} {
    return importResourcesFromPi(input).skills;
}
```

- [ ] **Step 2: Update pi-import tests**

In `tests/unit/pi-import.test.ts`:

1. Add `mkdirSync` and `writeFileSync` to imports if missing.
2. Add new test block for `importResourcesFromPi`:

```ts
describe("importResourcesFromPi", () => {
    let homeDir: string;
    beforeEach(() => {
        homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-all-"));
        mkdirSync(path.join(homeDir, ".pi/skills"), { recursive: true });
        mkdirSync(path.join(homeDir, ".pi/extensions"), { recursive: true });
        mkdirSync(path.join(homeDir, ".macpi"), { recursive: true });
    });
    afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

    it("copies skills (files only) and extensions (files + dirs)", () => {
        writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
        writeFileSync(path.join(homeDir, ".pi/extensions/single.ts"), "x");
        mkdirSync(path.join(homeDir, ".pi/extensions/folded"));
        writeFileSync(path.join(homeDir, ".pi/extensions/folded/index.ts"), "y");
        const r = importResourcesFromPi({
            piRoot: path.join(homeDir, ".pi"),
            macpiRoot: path.join(homeDir, ".macpi"),
        });
        expect(r.skills).toEqual({ copied: 1, skipped: 0 });
        expect(r.extensions).toEqual({ copied: 2, skipped: 0 });
        expect(
            readFileSync(path.join(homeDir, ".macpi/extensions/folded/index.ts"), "utf8"),
        ).toBe("y");
    });

    it("skips skills subdirectories (files only) but recurses into extension dirs", () => {
        mkdirSync(path.join(homeDir, ".pi/skills/nested"));
        writeFileSync(path.join(homeDir, ".pi/skills/nested/x.md"), "# nested");
        mkdirSync(path.join(homeDir, ".pi/extensions/dir"));
        writeFileSync(path.join(homeDir, ".pi/extensions/dir/inner.ts"), "z");
        const r = importResourcesFromPi({
            piRoot: path.join(homeDir, ".pi"),
            macpiRoot: path.join(homeDir, ".macpi"),
        });
        expect(r.skills.copied).toBe(0);
        expect(r.extensions.copied).toBe(1);
        expect(
            existsSync(path.join(homeDir, ".macpi/extensions/dir/inner.ts")),
        ).toBe(true);
    });
});
```

Update the existing `importSkillsFromPi` tests so they still pass (the function now delegates).

- [ ] **Step 3: Update services**

`src/main/skills-service.ts` — `importFromPi()` was a thin wrapper. Now it should delegate to `importResourcesFromPi` and return just the skills counts:

```ts
async importFromPi(): Promise<{ copied: number; skipped: number }> {
    const r = importResourcesFromPi({
        piRoot: path.join(this.deps.homeDir, ".pi"),
        macpiRoot: getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir),
    });
    return r.skills;
}
```

But we're renaming the IPC anyway — actually the cleanest thing is to add a top-level method on a new spot (or have the IPC handler call `importResourcesFromPi` directly via injected paths rather than per-service methods). Pick the simpler structure: drop `SkillsService.importFromPi`, have the IPC handler call `importResourcesFromPi` directly via a small handler-only helper.

Concretely: in `src/main/ipc-router.ts` register a `resources.importFromPi` handler:

```ts
this.register("resources.importFromPi", async () => {
    try {
        const r = importResourcesFromPi({
            piRoot: path.join(os.homedir(), ".pi"),
            macpiRoot: getResourceRoot(this.deps.appSettings.getAll(), os.homedir()),
        });
        return ok(r);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("import_failed", msg);
    }
});
```

Add the imports: `import { importResourcesFromPi } from "./pi-import";`, `import os from "node:os";`, `import { getResourceRoot } from "../shared/app-settings-keys";`.

Remove the old `this.register("skills.importFromPi", ...)` handler.

- [ ] **Step 4: Update IPC contract**

In `src/shared/ipc-types.ts`:

- Remove `"skills.importFromPi"`.
- Add:

```ts
"resources.importFromPi": {
    req: Record<string, never>;
    res: {
        skills: { copied: number; skipped: number };
        extensions: { copied: number; skipped: number };
    };
};
```

- [ ] **Step 5: Update queries + dialog**

In `src/renderer/queries.ts`, rename `useImportSkillsFromPi` to `useImportResourcesFromPi`:

```ts
export function useImportResourcesFromPi() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => invoke("resources.importFromPi", {}),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["skills.list"] });
            qc.invalidateQueries({ queryKey: ["extensions.list"] });
            window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
            window.dispatchEvent(new CustomEvent("macpi:extensions-changed"));
        },
    });
}
```

In `src/renderer/components/dialogs/ImportFromPiDialog.tsx`:

- Update the import to `useImportResourcesFromPi`.
- Update the result state to the new shape: `{ skills: { copied, skipped }, extensions: { copied, skipped } }`.
- Update the success message:

```tsx
{result && (
    <div className="text-xs text-emerald-300">
        Imported {result.skills.copied} skill(s); {result.extensions.copied} extension(s);
        skipped {result.skills.skipped + result.extensions.skipped}.
    </div>
)}
```

- [ ] **Step 6: Drop `SkillsService.importFromPi`**

In `src/main/skills-service.ts`, remove the `importFromPi` method (it's no longer called).

- [ ] **Step 7: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck && npm run lint && npm run test
```

All pass. Test count grows by 2 (the new pi-import tests).

- [ ] **Step 8: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u
cd /Users/roaanv/mycode/macpi && git commit -m "feat(import): copy skills + extensions; rename IPC to resources.importFromPi"
```

---

## Task 15: Wire `macpi:extensions-changed` event into timeline-state

**Files:**
- Modify: `src/renderer/state/timeline-state.ts`

- [ ] **Step 1: Listen for both events**

In `useTimeline`, the existing `useEffect` that adds `macpi:skills-changed` listeners — extend it to also listen for `macpi:extensions-changed`:

```ts
React.useEffect(() => {
    if (!piSessionId) return;
    const onChange = () => setSnapshot((prev) => ({ ...prev, skillsChanged: true }));
    const onCleared = () => setSnapshot((prev) => ({ ...prev, skillsChanged: false }));
    window.addEventListener("macpi:skills-changed", onChange);
    window.addEventListener("macpi:extensions-changed", onChange);  // new
    window.addEventListener("macpi:skills-changed-cleared", onCleared);
    return () => {
        window.removeEventListener("macpi:skills-changed", onChange);
        window.removeEventListener("macpi:extensions-changed", onChange);
        window.removeEventListener("macpi:skills-changed-cleared", onCleared);
    };
}, [piSessionId]);
```

(The `skillsChanged` flag name stays — see spec §4.5. Rename to `resourcesChanged` waits for phase 3.)

- [ ] **Step 2: Run gates**

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/state/timeline-state.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(renderer): macpi:extensions-changed also triggers reload banner"
```

---

## Task 16: Final gates + manual smoke

- [ ] **Step 1: Full suite**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/ tests/
cd /Users/roaanv/mycode/macpi && npm run test
```

Expected: typecheck clean, biome clean, all tests pass.

- [ ] **Step 2: Manual smoke**

1. Launch app. Open mode rail — Extensions mode is now enabled.
2. Extensions list empty state shows + Install / Import buttons.
3. (If you have `~/.pi/extensions/`) Click Import → counts include extensions; list refreshes.
4. Click "+ Install…" → enter a known git or local-path extension source → progress → list refreshes.
5. Select an extension → TypeScript editor loads. Type something with a Biome violation (unused var). Click Save. Lint runs automatically; diagnostic appears in the panel below.
6. Click Lint without saving — runs against the saved state.
7. Toggle an extension OFF in the list → click Reload session in chat. The disabled extension should NOT load.
8. Force a load error: edit a .ts to have invalid syntax (e.g., `}}}}`) on disk and refresh the list — the broken extension appears as a red ⚠ row at the top with the parse error.

---

## Self-Review

**Spec coverage:** Every clause of `docs/superpowers/specs/2026-05-11-macpi-extensions-management-design.md` is implemented:

- §1.1 reuse phase-1 infrastructure → Tasks 6, 7, 14, 15
- §1.2 TypeScript editor → Task 10
- §1.3 Biome on save → Tasks 8, 9, 13
- §1.4 Pi load errors in list → Tasks 3 (service), 12 (UI)
- §1.5 Extension file shape (files + dirs) → Task 14
- §2 SDK surface → Tasks 6 (loadExtensions), 7 (extensionsOverride)
- §3 Data model → Tasks 2, 3
- §4 UI → Tasks 10-13
- §5 IPC contract → Tasks 6, 9, 14
- §6 Lint mechanism → Tasks 8, 9, 13
- §7 Pi load errors → Tasks 3, 12
- §8 Phase 1 unification → Task 1
- §9 Test strategy → Distributed across Tasks 1, 2, 3, 8, 14
- §10 Dependencies → Task 10

**Placeholder scan:** No "TBD" / "TODO" markers in tasks; every code step has actual code.

**Type consistency:**
- `ExtensionSummary`/`ExtensionManifest`/`ExtensionLoadError`/`ExtensionDiagnostic` (defined Task 3, used Tasks 6, 9, 12, 13) ✓
- `PiImportResult` shape: `{ skills: { copied, skipped }, extensions: { copied, skipped } }` (Task 14, consumed by queries + dialog) ✓
- `extensionResourceId({ source, relativePath })` (defined Task 2, used Tasks 3, 7) ✓
- `ExtensionsServiceDeps.runBiome` signature (Task 3 stub, Task 8 real, Task 9 used) ✓
- `useInstallExtension` placeholder in Task 11, real in Task 12 — explicitly noted in Task 11 step 6 ✓
- `resources.importFromPi` rename (Task 14) — all callers updated in same task ✓
