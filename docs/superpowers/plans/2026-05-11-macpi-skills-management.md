# Skills Management (Phase 1 of §10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Skills list-detail view plus the shared infrastructure (isolated resource root, settings-driven enable/disable, install dialog with progress, reload-session mechanism, import-from-`~/.pi`) that Extensions and Prompts phases will reuse.

**Architecture:** macpi constructs pi's `DefaultResourceLoader` and `DefaultPackageManager` with `agentDir = <resourceRoot setting>` (default `~/.macpi`) so the GUI is isolated from a co-installed pi TUI. Enable/disable is a global `resourceEnabled: Record<string, boolean>` setting; the loader's `skillsOverride` hook filters out disabled entries. Editing/installing/removing/toggling a skill while a session is open surfaces a "Reload session" banner; clicking it disposes and re-attaches the in-process pi session, which constructs a fresh ResourceLoader and replays the persisted log.

**Tech Stack:** Electron 42, React 18, TanStack Query, `@earendil-works/pi-coding-agent` 0.74 (`DefaultResourceLoader`, `DefaultPackageManager`), CodeMirror 6 (markdown lang pack, basic-setup), Vitest 3, Biome v2.

---

## File Structure

**New files (main process):**
- `src/shared/skills-types.ts` — `SkillSummary`, `SkillManifest`, `PackageProgressEvent` (renderer-safe shapes derived from pi's `Skill`).
- `src/shared/resource-id.ts` — pure `skillResourceId({ source, relativePath }): string` + parse helper.
- `src/main/resource-root.ts` — `getResourceRoot(appSettings)`, ensures the dir exists.
- `src/main/skills-service.ts` — encapsulates ResourceLoader + PackageManager construction, list/read/save/install/remove/import/reload.
- `src/main/pi-import.ts` — copies `~/.pi/skills/*` into `<resourceRoot>/skills/*` with skip-if-exists.

**New files (renderer):**
- `src/renderer/components/SkillsMode.tsx` — top-level mode component (sidebar list + detail pane).
- `src/renderer/components/SkillsList.tsx` — left-pane list with toolbar (Install + Import + enabled toggles).
- `src/renderer/components/SkillDetail.tsx` — right-pane detail (manifest header + editor + save button).
- `src/renderer/components/MarkdownEditor.tsx` — CodeMirror 6 React wrapper, controlled by `{ value, onChange }`.
- `src/renderer/components/dialogs/InstallSkillDialog.tsx` — source input + live progress.
- `src/renderer/components/dialogs/ImportFromPiDialog.tsx` — confirmation modal with file list.
- `src/renderer/components/banners/SkillsChangedBanner.tsx` — reload-session banner.

**Modified files:**
- `src/shared/app-settings-keys.ts` — add `resourceRoot` and `resourceEnabled` keys + helpers.
- `src/shared/ipc-types.ts` — add 8 new IPC methods.
- `src/shared/pi-events.ts` — add `package.progress` variant.
- `src/main/ipc-router.ts` — register new handlers.
- `src/main/pi-session-manager.ts` — use `resourceRoot` for loader's `agentDir` + apply enabled-filter via `skillsOverride`; expose `disposeAndReattach(piSessionId)` for reload.
- `src/main/index.ts` — wire `SkillsService` into the router deps.
- `src/renderer/components/ModeRail.tsx` — flip `skills` to `enabled: true`.
- `src/renderer/App.tsx` — render `<SkillsMode>` when `mode === "skills"`.
- `src/renderer/components/DefaultsSettings.tsx` — add "Resource root" row with picker.
- `src/renderer/components/ChatPane.tsx` — render `<SkillsChangedBanner>` above the composer when skills changed during this session.
- `src/renderer/queries.ts` — new TanStack queries/mutations for skills.
- `src/renderer/state/timeline-state.ts` — add `skillsChanged: boolean` field + handle `package.progress` (no UI change yet, just reduce).
- `package.json` — add CodeMirror 6 deps.

**Test files:**
- `tests/unit/resource-id.test.ts`
- `tests/unit/resource-root.test.ts`
- `tests/unit/pi-import.test.ts`
- `tests/unit/app-settings-keys.test.ts` (extend if exists, else create)
- `tests/integration/skills-service.test.ts`
- `tests/integration/session-reload.test.ts`

---

## Task 1: Settings keys — `resourceRoot` + `resourceEnabled`

**Files:**
- Modify: `src/shared/app-settings-keys.ts`
- Modify (extend) or Create: `tests/unit/app-settings-keys.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/app-settings-keys.test.ts — add these cases to the existing file
import { describe, expect, it } from "vitest";
import {
	APP_SETTINGS_DEFAULTS,
	getResourceEnabled,
	getResourceRoot,
} from "../../src/shared/app-settings-keys";

describe("resourceRoot setting", () => {
	it("defaults to ~/.macpi when missing or non-string", () => {
		expect(getResourceRoot({}, "/Users/test")).toBe("/Users/test/.macpi");
		expect(getResourceRoot({ resourceRoot: 5 }, "/Users/test"))
			.toBe("/Users/test/.macpi");
	});
	it("returns the stored string value when valid", () => {
		expect(getResourceRoot({ resourceRoot: "/custom/path" }, "/Users/test"))
			.toBe("/custom/path");
	});
	it("APP_SETTINGS_DEFAULTS does not statically embed a home path", () => {
		// Defaults are home-relative at read time, not at module load.
		expect(APP_SETTINGS_DEFAULTS.resourceRoot).toBeUndefined();
	});
});

describe("resourceEnabled setting", () => {
	it("returns empty map when missing", () => {
		expect(getResourceEnabled({})).toEqual({});
	});
	it("returns the stored map", () => {
		const map = { "skill:local:foo.md": true, "skill:local:bar.md": false };
		expect(getResourceEnabled({ resourceEnabled: map })).toEqual(map);
	});
	it("guards against non-object values", () => {
		expect(getResourceEnabled({ resourceEnabled: "nope" })).toEqual({});
		expect(getResourceEnabled({ resourceEnabled: null })).toEqual({});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/app-settings-keys.test.ts`
Expected: FAIL — the new helpers don't exist yet.

- [ ] **Step 3: Add the helpers**

In `src/shared/app-settings-keys.ts`, add at the bottom:

```ts
/**
 * Resource root — where pi's loader/package-manager are pointed. Home-relative
 * default (~/.macpi) is resolved at read time so we don't bake the path into
 * the defaults map.
 */
export function getResourceRoot(
	settings: Record<string, unknown>,
	homeDir: string,
): string {
	const v = settings.resourceRoot;
	if (typeof v === "string" && v.length > 0) return v;
	return `${homeDir}/.macpi`;
}

/**
 * Global enabled map for resources. Missing entry = enabled.
 * Keyed by `<type>:<source>:<relative-path>`.
 */
export function getResourceEnabled(
	settings: Record<string, unknown>,
): Record<string, boolean> {
	const v = settings.resourceEnabled;
	if (v && typeof v === "object" && !Array.isArray(v)) {
		return v as Record<string, boolean>;
	}
	return {};
}
```

Do NOT add `resourceRoot` to `APP_SETTINGS_DEFAULTS` (it's home-relative, computed at read time).

- [ ] **Step 4: Run tests**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/app-settings-keys.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/app-settings-keys.ts tests/unit/app-settings-keys.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(settings): resourceRoot + resourceEnabled keys"
```

---

## Task 2: DefaultsSettings UI for `resourceRoot`

**Files:**
- Modify: `src/renderer/components/DefaultsSettings.tsx`

- [ ] **Step 1: Add a "Resource root" section**

In `src/renderer/components/DefaultsSettings.tsx`, mirror the existing "Default cwd" section. Add inside the same outer `<div className="flex flex-col gap-3">`, ABOVE the "Logs" section:

```tsx
<div>
    <div className="mb-1 text-sm font-medium">Resource root</div>
    <div className="mb-1 text-xs text-muted">
        Where macpi stores its skills, prompts, and extensions. Isolated
        from ~/.pi by default. Changes take effect for new sessions.
    </div>
    <div className="flex gap-2">
        <input
            type="text"
            value={resourceRootDraft}
            onChange={(e) => setResourceRootDraft(e.target.value)}
            onBlur={handleResourceRootBlur}
            placeholder={homeFallback.data ? `${homeFallback.data.cwd}/.macpi` : ""}
            className="flex-1 surface-row rounded px-2 py-1 text-sm"
        />
        <button
            type="button"
            onClick={handleResourceRootBrowse}
            title="Browse for folder"
            className="surface-row rounded px-2 hover:opacity-80"
        >
            📁
        </button>
    </div>
</div>
```

State + handlers paralleling the existing `draft`/`handleBrowse`/`handleBlur` pattern, but reading the `resourceRoot` settings key:

```tsx
const storedResourceRoot =
    (settings.resourceRoot as string | undefined) ?? "";
const [resourceRootDraft, setResourceRootDraft] = React.useState(storedResourceRoot);

React.useEffect(() => {
    setResourceRootDraft(storedResourceRoot);
}, [storedResourceRoot]);

const handleResourceRootBrowse = async () => {
    const r = await openFolder.mutateAsync({
        defaultPath: resourceRootDraft || undefined,
    });
    if (r.path) {
        setResourceRootDraft(r.path);
        setSetting.mutate({ key: "resourceRoot", value: r.path });
    }
};

const handleResourceRootBlur = () => {
    const trimmed = resourceRootDraft.trim();
    if (trimmed !== storedResourceRoot) {
        setSetting.mutate({ key: "resourceRoot", value: trimmed });
    }
};
```

- [ ] **Step 2: Verify gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/DefaultsSettings.tsx
cd /Users/roaanv/mycode/macpi && npm run test
```

- [ ] **Step 3: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/DefaultsSettings.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(settings): resource root picker in Defaults panel"
```

---

## Task 3: `getResourceRoot` ensure-dir helper

**Files:**
- Create: `src/main/resource-root.ts`
- Create: `tests/unit/resource-root.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resource-root.test.ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureResourceRoot } from "../../src/main/resource-root";

describe("ensureResourceRoot", () => {
	let homeDir: string;
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-home-"));
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("creates ~/.macpi when settings.resourceRoot is missing", () => {
		const root = ensureResourceRoot({}, homeDir);
		expect(root).toBe(path.join(homeDir, ".macpi"));
		expect(existsSync(root)).toBe(true);
	});
	it("creates the user's chosen dir when set", () => {
		const custom = path.join(homeDir, "custom");
		const root = ensureResourceRoot({ resourceRoot: custom }, homeDir);
		expect(root).toBe(custom);
		expect(existsSync(custom)).toBe(true);
	});
	it("no-ops when the dir already exists", () => {
		const root = ensureResourceRoot({}, homeDir);
		expect(() => ensureResourceRoot({}, homeDir)).not.toThrow();
		expect(existsSync(root)).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/resource-root.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/resource-root.ts
// Resolves the resource root path from settings (with ~/.macpi default) and
// ensures the directory exists. Called once per session-create so disabled
// users who change the setting see effects on the next session.

import fs from "node:fs";
import { getResourceRoot } from "../shared/app-settings-keys";

export function ensureResourceRoot(
	settings: Record<string, unknown>,
	homeDir: string,
): string {
	const root = getResourceRoot(settings, homeDir);
	fs.mkdirSync(root, { recursive: true });
	return root;
}
```

- [ ] **Step 4: Run tests**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/resource-root.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/resource-root.ts tests/unit/resource-root.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(resource-root): ensureResourceRoot helper"
```

---

## Task 4: Resource id helper + enabled filter

**Files:**
- Create: `src/shared/resource-id.ts`
- Create: `tests/unit/resource-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/resource-id.test.ts
import { describe, expect, it } from "vitest";
import {
	filterEnabled,
	parseResourceId,
	skillResourceId,
} from "../../src/shared/resource-id";

describe("resource-id", () => {
	it("formats skill ids", () => {
		expect(skillResourceId({ source: "local", relativePath: "foo.md" }))
			.toBe("skill:local:foo.md");
		expect(skillResourceId({ source: "git@github.com:x/y.git", relativePath: "sub/bar.md" }))
			.toBe("skill:git@github.com:x/y.git:sub/bar.md");
	});
	it("parses skill ids back", () => {
		expect(parseResourceId("skill:local:foo.md")).toEqual({
			type: "skill",
			source: "local",
			relativePath: "foo.md",
		});
		// Source containing colons is preserved (we only split on the first two).
		expect(parseResourceId("skill:git@github.com:x/y.git:sub/bar.md")).toEqual({
			type: "skill",
			source: "git@github.com:x/y.git",
			relativePath: "sub/bar.md",
		});
	});
	it("returns null for malformed ids", () => {
		expect(parseResourceId("not-an-id")).toBeNull();
		expect(parseResourceId("skill:only")).toBeNull();
	});
});

describe("filterEnabled", () => {
	const items = [
		{ id: "skill:local:a.md", name: "a" },
		{ id: "skill:local:b.md", name: "b" },
		{ id: "skill:local:c.md", name: "c" },
	];
	it("missing entries treated as enabled", () => {
		expect(filterEnabled(items, {})).toEqual(items);
	});
	it("explicit false filters out", () => {
		expect(filterEnabled(items, { "skill:local:b.md": false })).toEqual([
			items[0],
			items[2],
		]);
	});
	it("explicit true keeps in", () => {
		expect(
			filterEnabled(items, {
				"skill:local:a.md": true,
				"skill:local:b.md": false,
			}),
		).toEqual([items[0], items[2]]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// src/shared/resource-id.ts
// Stable id for resources (skills, extensions, prompts) discovered by pi.
// Format: `<type>:<source>:<relative-path-from-source-root>`.
// Source MAY contain colons (e.g., git@host:path); we split only the
// leading "<type>:" and "<source-up-to-last-colon-before-path>", so the
// final colon separates source from path.

export type ResourceType = "skill" | "extension" | "prompt";

export interface ResourceIdParts {
	type: ResourceType;
	source: string;
	relativePath: string;
}

export function skillResourceId(opts: {
	source: string;
	relativePath: string;
}): string {
	return `skill:${opts.source}:${opts.relativePath}`;
}

export function parseResourceId(id: string): ResourceIdParts | null {
	// Split into [type, ...rest].
	const firstColon = id.indexOf(":");
	if (firstColon < 0) return null;
	const type = id.slice(0, firstColon) as ResourceType;
	if (type !== "skill" && type !== "extension" && type !== "prompt") {
		return null;
	}
	const rest = id.slice(firstColon + 1);
	// Split source from path on the LAST colon, so source can contain colons.
	const lastColon = rest.lastIndexOf(":");
	if (lastColon < 0) return null;
	const source = rest.slice(0, lastColon);
	const relativePath = rest.slice(lastColon + 1);
	if (!source || !relativePath) return null;
	return { type, source, relativePath };
}

export function filterEnabled<T extends { id: string }>(
	items: T[],
	enabled: Record<string, boolean>,
): T[] {
	return items.filter((item) => enabled[item.id] !== false);
}
```

- [ ] **Step 4: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/resource-id.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
```
Expected: pass.

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/resource-id.ts tests/unit/resource-id.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(resource-id): stable id format + filterEnabled util"
```

---

## Task 5: Plumb `resourceRoot` through PiSessionManager

**Files:**
- Modify: `src/main/pi-session-manager.ts`
- Modify: `src/main/index.ts`

This task is wiring — no new tests. The existing pi-integration tests catch any regression on session creation.

- [ ] **Step 1: Inject `appSettings` and `homeDir` into PiSessionManager**

The manager currently constructs a ResourceLoader internally. Make it use `agentDir = ensureResourceRoot(appSettings.getAll(), homeDir)`.

In `src/main/pi-session-manager.ts`:

1. Add a constructor param object so `PiSessionManager` can read settings:

```ts
export interface PiSessionManagerDeps {
    appSettings: AppSettingsRepo;
    homeDir: string;
}

constructor(deps?: PiSessionManagerDeps) {
    this.deps = deps;
    // ... existing init
}
```

2. Wherever the ResourceLoader is constructed (search for `resourceLoader` references and SDK call sites), resolve agentDir from settings:

```ts
import { ensureResourceRoot } from "./resource-root";
// ...
const agentDir = this.deps
    ? ensureResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir)
    : path.join(os.homedir(), ".macpi");
const resourceLoader = new ctx.mod.DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: ctx.settings,
    // skillsOverride will land in Task 6 — leave undefined here.
});
```

(If the existing code constructs the loader differently — e.g., via a helper — adapt accordingly. The intent: pass `agentDir` derived from our setting, not pi's default `~/.pi`.)

3. Do the same for `DefaultPackageManager` if it's constructed in this file.

- [ ] **Step 2: Wire deps in `index.ts`**

```ts
import os from "node:os";
// ...
piSessionManager = new PiSessionManager({
    appSettings,
    homeDir: os.homedir(),
});
```

- [ ] **Step 3: Run the full test suite**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npm run test
```

Expect 163 tests to still pass. pi-integration tests will continue to use their own temp dirs and shouldn't see the change.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/pi-session-manager.ts src/main/index.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(pi): point ResourceLoader at resourceRoot setting"
```

---

## Task 6: Skills service — list/read + enabled filter

**Files:**
- Create: `src/shared/skills-types.ts`
- Create: `src/main/skills-service.ts`
- Create: `tests/integration/skills-service.test.ts`

- [ ] **Step 1: Shared types**

```ts
// src/shared/skills-types.ts
// Renderer-safe shapes for skills surfaced over IPC.
// Derived from pi's `Skill` type but trimmed to what the UI needs.

export interface SkillSummary {
	id: string;
	name: string;
	source: string;
	relativePath: string;
	enabled: boolean;
}

export interface SkillManifest {
	name: string;
	source: string;
	relativePath: string;
	version?: string;
}
```

- [ ] **Step 2: Skills service**

```ts
// src/main/skills-service.ts
// Reads skills via pi's DefaultResourceLoader applying our global
// `resourceEnabled` filter. Exposes list/read; later tasks add save,
// install, remove, import.

import fs from "node:fs";
import path from "node:path";
import { skillResourceId } from "../shared/resource-id";
import {
	getResourceEnabled,
	getResourceRoot,
} from "../shared/app-settings-keys";
import type { SkillManifest, SkillSummary } from "../shared/skills-types";
import type { AppSettingsRepo } from "./repos/app-settings";

interface PiSkill {
	name: string;
	source?: { id?: string };
	filePath?: string;
}

export interface SkillsServiceDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
	loadSkills: () => Promise<PiSkill[]>;
}

export class SkillsService {
	constructor(private readonly deps: SkillsServiceDeps) {}

	private resourceRoot(): string {
		return getResourceRoot(this.deps.appSettings.getAll(), this.deps.homeDir);
	}

	private idFor(skill: PiSkill): {
		id: string;
		source: string;
		relativePath: string;
	} {
		const source = skill.source?.id ?? "local";
		const relativePath = skill.filePath
			? path.relative(this.resourceRoot(), skill.filePath)
			: skill.name;
		return {
			id: skillResourceId({ source, relativePath }),
			source,
			relativePath,
		};
	}

	async list(): Promise<SkillSummary[]> {
		const skills = await this.deps.loadSkills();
		const enabled = getResourceEnabled(this.deps.appSettings.getAll());
		return skills.map((s) => {
			const ids = this.idFor(s);
			return {
				id: ids.id,
				name: s.name,
				source: ids.source,
				relativePath: ids.relativePath,
				enabled: enabled[ids.id] !== false,
			};
		});
	}

	async read(id: string): Promise<{ manifest: SkillManifest; body: string }> {
		const skills = await this.deps.loadSkills();
		const target = skills.find((s) => this.idFor(s).id === id);
		if (!target) throw new Error(`skill not found: ${id}`);
		const ids = this.idFor(target);
		const body = target.filePath ? fs.readFileSync(target.filePath, "utf8") : "";
		return {
			manifest: {
				name: target.name,
				source: ids.source,
				relativePath: ids.relativePath,
			},
			body,
		};
	}
}
```

- [ ] **Step 3: Integration test with a fixture loader**

```ts
// tests/integration/skills-service.test.ts
import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/main/db/migrations";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";
import { SkillsService } from "../../src/main/skills-service";

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

describe("SkillsService", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-skills-"));
		mkdirSync(path.join(dir, ".macpi/skills"), { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	function makeService(opts: { enabled?: Record<string, boolean> }) {
		const db = makeDb();
		const appSettings = new AppSettingsRepo(db);
		if (opts.enabled) {
			appSettings.set("resourceEnabled", opts.enabled);
		}
		appSettings.set("resourceRoot", path.join(dir, ".macpi"));
		return new SkillsService({
			appSettings,
			homeDir: dir,
			loadSkills: async () => [
				{
					name: "a",
					source: { id: "local" },
					filePath: path.join(dir, ".macpi/skills/a.md"),
				},
				{
					name: "b",
					source: { id: "local" },
					filePath: path.join(dir, ".macpi/skills/b.md"),
				},
			],
		});
	}

	it("list returns enabled flags from settings", async () => {
		const svc = makeService({
			enabled: { "skill:local:a.md": true, "skill:local:b.md": false },
		});
		const skills = await svc.list();
		expect(skills.map((s) => [s.name, s.enabled])).toEqual([
			["a", true],
			["b", false],
		]);
	});

	it("list treats missing entries as enabled", async () => {
		const svc = makeService({});
		const skills = await svc.list();
		expect(skills.every((s) => s.enabled)).toBe(true);
	});

	it("read returns the file body", async () => {
		writeFileSync(path.join(dir, ".macpi/skills/a.md"), "# hello");
		const svc = makeService({});
		const skills = await svc.list();
		const detail = await svc.read(skills[0].id);
		expect(detail.body).toBe("# hello");
		expect(detail.manifest.name).toBe("a");
	});

	it("read throws on unknown id", async () => {
		const svc = makeService({});
		await expect(svc.read("skill:local:nope.md")).rejects.toThrow();
	});
});
```

- [ ] **Step 4: Run tests + gates**

```
cd /Users/roaanv/mycode/macpi && npx vitest run tests/integration/skills-service.test.ts
cd /Users/roaanv/mycode/macpi && npm run typecheck
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/skills-types.ts src/main/skills-service.ts tests/integration/skills-service.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(skills): SkillsService.list + .read with enabled filter"
```

---

## Task 7: Skills IPC — `skills.list`, `skills.read`

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add to `IpcMethods`**

```ts
"skills.list": {
    req: Record<string, never>;
    res: { skills: SkillSummary[] };
};
"skills.read": {
    req: { id: string };
    res: { manifest: SkillManifest; body: string };
};
```

Import `SkillSummary` and `SkillManifest` at the top of the file.

- [ ] **Step 2: Construct SkillsService in `index.ts`**

```ts
import { SkillsService } from "./skills-service";
import { ensureResourceRoot } from "./resource-root";
// inside whenReady, after piSessionManager is created:
const skillsService = new SkillsService({
    appSettings,
    homeDir: os.homedir(),
    loadSkills: () => piSessionManager.loadSkills(),
});
```

Add a `loadSkills(): Promise<PiSkill[]>` method on `PiSessionManager` that constructs a one-shot ResourceLoader (using the same `agentDir`) and returns `loader.getSkills().skills`. This avoids leaking the SDK type into `index.ts`.

- [ ] **Step 3: Register handlers**

In `IpcRouter`, accept `skillsService` in `RouterDeps` and register:

```ts
this.register("skills.list", async () => {
    return ok({ skills: await this.deps.skillsService.list() });
});
this.register("skills.read", async (args) => {
    return ok(await this.deps.skillsService.read(args.id));
});
```

Wrap `skillsService.read` in try/catch returning `err("not_found", ...)` when the message starts with "skill not found".

- [ ] **Step 4: Update the ipc-router test deps**

In `tests/integration/ipc-router.test.ts`, add a stub `skillsService` to the `beforeEach`:

```ts
const skillsServiceStub = {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue({
        manifest: { name: "x", source: "local", relativePath: "x.md" },
        body: "",
    }),
};
// ... in router construction:
skillsService: skillsServiceStub as unknown as SkillsService,
```

- [ ] **Step 5: Run gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npm run test
```
All pass.

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/shared/ipc-types.ts src/main/ipc-router.ts src/main/index.ts src/main/pi-session-manager.ts tests/integration/ipc-router.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(ipc): skills.list + skills.read"
```

---

## Task 8: Skills IPC — `skills.save` + `skills.setEnabled`

**Files:**
- Modify: `src/main/skills-service.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/integration/skills-service.test.ts`

- [ ] **Step 1: Add tests**

Add to `tests/integration/skills-service.test.ts`:

```ts
it("save writes the body to the skill's filePath", async () => {
    writeFileSync(path.join(dir, ".macpi/skills/a.md"), "old");
    const svc = makeService({});
    const skills = await svc.list();
    await svc.save(skills[0].id, "new body");
    expect(readFileSync(path.join(dir, ".macpi/skills/a.md"), "utf8")).toBe("new body");
});

it("setEnabled toggles the resourceEnabled map", async () => {
    const svc = makeService({});
    const skills = await svc.list();
    await svc.setEnabled(skills[0].id, false);
    const after = await svc.list();
    expect(after.find((s) => s.id === skills[0].id)?.enabled).toBe(false);
});
```

Add `readFileSync` to the imports.

- [ ] **Step 2: Implement on SkillsService**

```ts
async save(id: string, body: string): Promise<void> {
    const skills = await this.deps.loadSkills();
    const target = skills.find((s) => this.idFor(s).id === id);
    if (!target || !target.filePath) {
        throw new Error(`skill not found or has no file: ${id}`);
    }
    fs.writeFileSync(target.filePath, body);
}

async setEnabled(id: string, enabled: boolean): Promise<void> {
    const current = getResourceEnabled(this.deps.appSettings.getAll());
    const next = { ...current, [id]: enabled };
    this.deps.appSettings.set("resourceEnabled", next);
}
```

- [ ] **Step 3: IPC methods**

In `src/shared/ipc-types.ts`:

```ts
"skills.save": {
    req: { id: string; body: string };
    res: Record<string, never>;
};
"skills.setEnabled": {
    req: { id: string; enabled: boolean };
    res: Record<string, never>;
};
```

Register in router:

```ts
this.register("skills.save", async (args) => {
    await this.deps.skillsService.save(args.id, args.body);
    return ok({});
});
this.register("skills.setEnabled", async (args) => {
    await this.deps.skillsService.setEnabled(args.id, args.enabled);
    return ok({});
});
```

- [ ] **Step 4: Run tests + gates**

Expected: 2 new tests pass; full suite green.

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(skills): save + setEnabled"
```

---

## Task 9: Skills IPC — `skills.install`, `skills.remove` + `package.progress` event

**Files:**
- Modify: `src/main/skills-service.ts`
- Modify: `src/shared/pi-events.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`

- [ ] **Step 1: Add the PiEvent variant**

In `src/shared/pi-events.ts`:

```ts
| {
        type: "package.progress";
        action: "install" | "remove" | "update" | "clone" | "pull";
        source: string;
        phase: "start" | "progress" | "complete" | "error";
        message?: string;
    }
```

- [ ] **Step 2: SkillsService install/remove**

Inject a `packageManager` factory into `SkillsServiceDeps`. The factory returns the active `DefaultPackageManager` instance. Pi exposes `setProgressCallback`; we wire it to emit our PiEvent. Add:

```ts
import type { PiEvent } from "../shared/pi-events";

// In SkillsServiceDeps:
loadPackageManager: () => Promise<{
    install: (source: string, options?: { local?: boolean }) => Promise<void>;
    removeAndPersist: (source: string, options?: { local?: boolean }) => Promise<boolean>;
    installAndPersist: (source: string, options?: { local?: boolean }) => Promise<void>;
    setProgressCallback: (cb: ((e: { type: string; action: string; source: string; message?: string }) => void) | undefined) => void;
}>;
emitEvent: (e: PiEvent) => void;
```

```ts
async install(source: string): Promise<void> {
    const pm = await this.deps.loadPackageManager();
    pm.setProgressCallback((e) => {
        this.deps.emitEvent({
            type: "package.progress",
            action: e.action as "install" | "remove" | "update" | "clone" | "pull",
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

- [ ] **Step 3: IPC methods**

```ts
"skills.install": {
    req: { source: string };
    res: Record<string, never>;
};
"skills.remove": {
    req: { source: string };
    res: Record<string, never>;
};
```

Register handlers calling `skillsService.install` / `.remove`. Wrap with try/catch returning `err("install_failed", e.message)` etc.

- [ ] **Step 4: Wire `emitEvent` in `index.ts`**

```ts
const skillsService = new SkillsService({
    appSettings,
    homeDir: os.homedir(),
    loadSkills: () => piSessionManager.loadSkills(),
    loadPackageManager: () => piSessionManager.loadPackageManager(),
    emitEvent: (event) => piSessionManager.broadcastEvent(event),
});
```

Add `broadcastEvent(event: PiEvent)` method on `PiSessionManager` that calls the existing private `emit(event)` so external callers can publish events through the same listener fan-out the renderer already subscribes to.

- [ ] **Step 5: Run tests + gates**

The existing pi-integration tests should be unaffected. No new test for install in this task — manual smoke covers the live install flow in Task 17.

- [ ] **Step 6: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(skills): install + remove with progress events"
```

---

## Task 10: Pi import service + IPC

**Files:**
- Create: `src/main/pi-import.ts`
- Create: `tests/unit/pi-import.test.ts`
- Modify: `src/main/skills-service.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pi-import.test.ts
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importSkillsFromPi } from "../../src/main/pi-import";

describe("importSkillsFromPi", () => {
	let homeDir: string;
	beforeEach(() => {
		homeDir = mkdtempSync(path.join(os.tmpdir(), "macpi-import-"));
		mkdirSync(path.join(homeDir, ".pi/skills"), { recursive: true });
		mkdirSync(path.join(homeDir, ".macpi/skills"), { recursive: true });
	});
	afterEach(() => rmSync(homeDir, { recursive: true, force: true }));

	it("copies top-level skill files from ~/.pi/skills to ~/.macpi/skills", () => {
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
		writeFileSync(path.join(homeDir, ".pi/skills/b.md"), "# b");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(2);
		expect(r.skipped).toBe(0);
		expect(readFileSync(path.join(homeDir, ".macpi/skills/a.md"), "utf8"))
			.toBe("# a");
	});

	it("skips files that already exist at the target", () => {
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# new");
		writeFileSync(path.join(homeDir, ".macpi/skills/a.md"), "# keep");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(0);
		expect(r.skipped).toBe(1);
		expect(readFileSync(path.join(homeDir, ".macpi/skills/a.md"), "utf8"))
			.toBe("# keep");
	});

	it("no-ops when ~/.pi/skills doesn't exist", () => {
		rmSync(path.join(homeDir, ".pi/skills"), { recursive: true });
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(0);
		expect(r.skipped).toBe(0);
	});

	it("creates ~/.macpi/skills if missing", () => {
		rmSync(path.join(homeDir, ".macpi"), { recursive: true });
		writeFileSync(path.join(homeDir, ".pi/skills/a.md"), "# a");
		const r = importSkillsFromPi({
			piRoot: path.join(homeDir, ".pi"),
			macpiRoot: path.join(homeDir, ".macpi"),
		});
		expect(r.copied).toBe(1);
		expect(existsSync(path.join(homeDir, ".macpi/skills/a.md"))).toBe(true);
	});
});
```

- [ ] **Step 2: Implement**

```ts
// src/main/pi-import.ts
// Copies top-level skills from a pi installation (~/.pi/skills) into
// macpi's resource root. Skip-if-exists; never overwrites. Phase 1
// imports only top-level files; package-installed skills are not
// touched.

import fs from "node:fs";
import path from "node:path";

export interface PiImportInput {
	piRoot: string;
	macpiRoot: string;
}

export interface PiImportResult {
	copied: number;
	skipped: number;
}

export function importSkillsFromPi(input: PiImportInput): PiImportResult {
	const src = path.join(input.piRoot, "skills");
	const dst = path.join(input.macpiRoot, "skills");
	if (!fs.existsSync(src)) return { copied: 0, skipped: 0 };
	fs.mkdirSync(dst, { recursive: true });
	let copied = 0;
	let skipped = 0;
	for (const name of fs.readdirSync(src)) {
		const srcFile = path.join(src, name);
		const dstFile = path.join(dst, name);
		const stat = fs.statSync(srcFile);
		if (!stat.isFile()) continue; // phase 1: top-level files only
		if (fs.existsSync(dstFile)) {
			skipped++;
			continue;
		}
		fs.copyFileSync(srcFile, dstFile);
		copied++;
	}
	return { copied, skipped };
}
```

- [ ] **Step 3: Plumb through SkillsService + IPC**

`SkillsService.importFromPi()` is a thin wrapper:

```ts
async importFromPi(): Promise<PiImportResult> {
    return importSkillsFromPi({
        piRoot: path.join(this.deps.homeDir, ".pi"),
        macpiRoot: this.resourceRoot(),
    });
}
```

IPC:

```ts
"skills.importFromPi": {
    req: Record<string, never>;
    res: { copied: number; skipped: number };
};
```

Handler returns the result via `ok(...)`.

- [ ] **Step 4: Run tests + gates**

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/main/pi-import.ts src/main/skills-service.ts src/main/ipc-router.ts src/shared/ipc-types.ts tests/unit/pi-import.test.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(skills): import skills from ~/.pi"
```

---

## Task 11: `session.reload` — dispose + reattach

**Files:**
- Modify: `src/main/pi-session-manager.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Create: `tests/integration/session-reload.test.ts`

- [ ] **Step 1: Add a `reloadSession` method on PiSessionManager**

```ts
/** Abort, dispose, and reattach an active session. */
async reloadSession(piSessionId: string): Promise<void> {
    const active = this.active.get(piSessionId);
    if (!active) throw new Error(`unknown session ${piSessionId}`);
    await this.abort(piSessionId).catch(() => {});
    await this.disposeSession(piSessionId);
    await this.attachSession({ piSessionId });
}
```

(`disposeSession` and `attachSession` exist in the file today; verify their names and adapt if slightly different.)

- [ ] **Step 2: IPC method**

```ts
"session.reload": {
    req: { piSessionId: string };
    res: Record<string, never>;
};
```

Register:

```ts
this.register("session.reload", async (args) => {
    await this.deps.piSessionManager.reloadSession(args.piSessionId);
    return ok({});
});
```

- [ ] **Step 3: Integration test**

```ts
// tests/integration/session-reload.test.ts
import { describe, expect, it, vi } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

describe("PiSessionManager.reloadSession", () => {
	it("aborts, disposes, then reattaches", async () => {
		const manager = new PiSessionManager();
		const abort = vi.spyOn(manager, "abort").mockResolvedValue();
		const dispose = vi.spyOn(manager, "disposeSession").mockResolvedValue();
		const attach = vi.spyOn(manager, "attachSession").mockResolvedValue();
		// Force an active entry so the unknown-session guard doesn't fire.
		// biome-ignore lint/suspicious/noExplicitAny: test reaches into internals
		(manager as any).active.set("s1", { piSessionId: "s1" });

		await manager.reloadSession("s1");

		expect(abort).toHaveBeenCalledWith("s1");
		expect(dispose).toHaveBeenCalledWith("s1");
		expect(attach).toHaveBeenCalledWith({ piSessionId: "s1" });
		// Order check via mock invocation order:
		const abortIdx = abort.mock.invocationCallOrder[0];
		const disposeIdx = dispose.mock.invocationCallOrder[0];
		const attachIdx = attach.mock.invocationCallOrder[0];
		expect(abortIdx).toBeLessThan(disposeIdx);
		expect(disposeIdx).toBeLessThan(attachIdx);
	});

	it("rejects when piSessionId is unknown", async () => {
		const manager = new PiSessionManager();
		await expect(manager.reloadSession("nope")).rejects.toThrow(/unknown/);
	});
});
```

- [ ] **Step 4: Run tests + gates**

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(session): session.reload via dispose + reattach"
```

---

## Task 12: Mode rail + SkillsMode shell

**Files:**
- Modify: `src/renderer/components/ModeRail.tsx`
- Create: `src/renderer/components/SkillsMode.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Flip skills to enabled**

In `src/renderer/components/ModeRail.tsx`, change `{ mode: "skills", enabled: false }` to `{ mode: "skills", enabled: true }`.

- [ ] **Step 2: Create the shell**

```tsx
// src/renderer/components/SkillsMode.tsx
// Top-level skills mode: list on the left, detail on the right.
// Mirrors ChatPane's container shape.

import React from "react";
import { SkillsList } from "./SkillsList";
import { SkillDetail } from "./SkillDetail";

export function SkillsMode() {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    return (
        <>
            <SkillsList
                selectedId={selectedId}
                onSelect={setSelectedId}
            />
            <SkillDetail id={selectedId} onClearSelection={() => setSelectedId(null)} />
        </>
    );
}
```

(For now `SkillsList` and `SkillDetail` are stubs returning placeholder divs; subsequent tasks flesh them out. Add stub files so the imports resolve.)

```tsx
// src/renderer/components/SkillsList.tsx
export function SkillsList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
    return <aside className="w-64 surface-rail border-r border-divider p-2 text-muted">Skills list (coming in task 13)</aside>;
}
```

```tsx
// src/renderer/components/SkillDetail.tsx
export function SkillDetail({ id, onClearSelection }: { id: string | null; onClearSelection: () => void }) {
    return <section className="flex-1 surface-panel p-4 text-muted">{id ? `Detail for ${id}` : "Select a skill"}</section>;
}
```

- [ ] **Step 3: Render in `App.tsx`**

In `src/renderer/App.tsx`, replace the always-`<ChatPane>` rendering with a mode switch:

```tsx
{mode === "chat" && <ChatPane piSessionId={sessionId} onOpenGlobalSettings={() => setGlobalSettingsOpen(true)} />}
{mode === "skills" && <SkillsMode />}
```

(For modes that are still disabled — extensions, prompts — leave a placeholder div or nothing.)

The `ChannelSidebar` should hide when not in chat mode — wrap it in `{mode === "chat" && ...}`.

- [ ] **Step 4: Verify gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/SkillsMode.tsx src/renderer/components/SkillsList.tsx src/renderer/components/SkillDetail.tsx src/renderer/components/ModeRail.tsx src/renderer/App.tsx
```

- [ ] **Step 5: Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/SkillsMode.tsx src/renderer/components/SkillsList.tsx src/renderer/components/SkillDetail.tsx src/renderer/components/ModeRail.tsx src/renderer/App.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(skills): enable skills mode with shell components"
```

---

## Task 13: Skills list view

**Files:**
- Modify: `src/renderer/components/SkillsList.tsx`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add queries**

In `src/renderer/queries.ts`:

```ts
export function useSkills() {
    return useQuery({
        queryKey: ["skills.list"],
        queryFn: () => invoke("skills.list", {}),
    });
}

export function useSetSkillEnabled() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; enabled: boolean }) =>
            invoke("skills.setEnabled", input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["skills.list"] }),
    });
}
```

- [ ] **Step 2: Implement the list**

Replace the stub in `SkillsList.tsx`:

```tsx
import React from "react";
import { useSkills, useSetSkillEnabled } from "../queries";

interface SkillsListProps {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onInstall: () => void;
    onImport: () => void;
}

export function SkillsList({ selectedId, onSelect, onInstall, onImport }: SkillsListProps) {
    const skills = useSkills();
    const setEnabled = useSetSkillEnabled();

    return (
        <aside className="w-64 surface-rail border-r border-divider flex flex-col">
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
                {skills.isLoading && <div className="p-2 text-xs text-muted">Loading…</div>}
                {skills.data?.skills.length === 0 && (
                    <div className="p-2 text-xs text-muted">
                        No skills yet. Install or import from ~/.pi.
                    </div>
                )}
                {skills.data?.skills.map((s) => (
                    <div
                        key={s.id}
                        className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === s.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
                    >
                        <input
                            type="checkbox"
                            checked={s.enabled}
                            onChange={(e) =>
                                setEnabled.mutate({ id: s.id, enabled: e.target.checked })
                            }
                            aria-label={`Enable ${s.name}`}
                        />
                        <button
                            type="button"
                            onClick={() => onSelect(s.id)}
                            className="flex-1 text-left truncate"
                        >
                            {s.name}
                            <span className="ml-2 text-[10px] text-muted">{s.source}</span>
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
```

Update `SkillsMode.tsx` to pass `onInstall` / `onImport` callbacks (state for which dialog is open):

```tsx
const [installOpen, setInstallOpen] = React.useState(false);
const [importOpen, setImportOpen] = React.useState(false);
// pass setInstallOpen / setImportOpen to SkillsList; the dialogs themselves arrive in tasks 16 and 17.
```

- [ ] **Step 3: Verify gates**

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(skills): list view with toolbar + enabled toggles"
```

---

## Task 14: CodeMirror 6 deps + MarkdownEditor wrapper

**Files:**
- Modify: `package.json` (+ `package-lock.json`)
- Create: `src/renderer/components/MarkdownEditor.tsx`

- [ ] **Step 1: Install deps**

```
cd /Users/roaanv/mycode/macpi && npm install --save @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/commands @codemirror/language
```

(`@codemirror/basic-setup` is no longer current; assemble manually with `state` / `view` / `commands` / `language` / `lang-markdown`.)

- [ ] **Step 2: Implement the wrapper**

```tsx
// src/renderer/components/MarkdownEditor.tsx
// React wrapper around CodeMirror 6. Controlled by { value, onChange }.
// Recreates the EditorView only when the editor mounts; subsequent value
// changes are pushed via transactions to preserve cursor / undo history.

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import React from "react";

interface MarkdownEditorProps {
    value: string;
    onChange: (next: string) => void;
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const viewRef = React.useRef<EditorView | null>(null);

    React.useEffect(() => {
        if (!hostRef.current) return;
        const view = new EditorView({
            state: EditorState.create({
                doc: value,
                extensions: [
                    lineNumbers(),
                    history(),
                    markdown(),
                    keymap.of([...defaultKeymap, ...historyKeymap]),
                    EditorView.theme(
                        { "&": { height: "100%" }, ".cm-scroller": { fontFamily: "var(--font-family-mono, monospace)" } },
                        { dark: true },
                    ),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged) {
                            onChange(update.state.doc.toString());
                        }
                    }),
                ],
            }),
            parent: hostRef.current,
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // We intentionally mount once. Value sync is handled by the next effect.
        // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once intent
    }, []);

    // Sync external value changes when they differ from the editor's doc.
    React.useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const doc = view.state.doc.toString();
        if (doc !== value) {
            view.dispatch({ changes: { from: 0, to: doc.length, insert: value } });
        }
    }, [value]);

    return <div ref={hostRef} className="flex-1 overflow-hidden" />;
}
```

- [ ] **Step 3: Verify gates**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/renderer/components/MarkdownEditor.tsx
cd /Users/roaanv/mycode/macpi && npm run test
```

CodeMirror itself has no unit tests here — wrapper smoke is via Task 17.

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add package.json package-lock.json src/renderer/components/MarkdownEditor.tsx
cd /Users/roaanv/mycode/macpi && git commit -m "feat(editor): CodeMirror 6 markdown wrapper"
```

---

## Task 15: Skill detail view + save flow

**Files:**
- Modify: `src/renderer/components/SkillDetail.tsx`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add queries**

```ts
export function useSkillDetail(id: string | null) {
    return useQuery({
        queryKey: ["skills.read", id],
        queryFn: () => invoke("skills.read", { id: id! }),
        enabled: id !== null,
    });
}

export function useSaveSkill() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; body: string }) =>
            invoke("skills.save", input),
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ["skills.read", vars.id] });
        },
    });
}
```

- [ ] **Step 2: Implement the detail view**

```tsx
import React from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { useSaveSkill, useSkillDetail } from "../queries";

interface SkillDetailProps {
    id: string | null;
}

export function SkillDetail({ id }: SkillDetailProps) {
    const detail = useSkillDetail(id);
    const save = useSaveSkill();
    const [draft, setDraft] = React.useState("");

    // Hydrate draft when detail loads or id changes
    React.useEffect(() => {
        if (detail.data) setDraft(detail.data.body);
    }, [detail.data, id]);

    if (!id) {
        return (
            <section className="flex-1 surface-panel p-6 text-muted">
                Select a skill on the left to view or edit it.
            </section>
        );
    }
    if (detail.isLoading) {
        return <section className="flex-1 surface-panel p-6 text-muted">Loading…</section>;
    }
    if (!detail.data) {
        return <section className="flex-1 surface-panel p-6 text-muted">Skill not found.</section>;
    }

    const dirty = draft !== detail.data.body;

    return (
        <section className="flex flex-1 flex-col surface-panel">
            <header className="border-b border-divider p-3">
                <div className="text-sm font-semibold text-primary">{detail.data.manifest.name}</div>
                <div className="text-xs text-muted">
                    {detail.data.manifest.source} · {detail.data.manifest.relativePath}
                </div>
            </header>
            <MarkdownEditor value={draft} onChange={setDraft} />
            <footer className="flex items-center justify-end gap-2 border-t border-divider p-2">
                {dirty && <span className="text-xs text-amber-300">• unsaved</span>}
                <button
                    type="button"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate({ id, body: draft })}
                    className="surface-row rounded px-3 py-1 text-xs disabled:opacity-40 hover:opacity-80"
                >
                    {save.isPending ? "Saving…" : "Save"}
                </button>
            </footer>
        </section>
    );
}
```

- [ ] **Step 3: Verify**

- [ ] **Step 4: Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(skills): detail view with markdown editor + save"
```

---

## Task 16: Install dialog with live progress

**Files:**
- Create: `src/renderer/components/dialogs/InstallSkillDialog.tsx`
- Modify: `src/renderer/components/SkillsMode.tsx`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add the install mutation**

```ts
export function useInstallSkill() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { source: string }) => invoke("skills.install", input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["skills.list"] }),
    });
}
```

- [ ] **Step 2: Implement the dialog**

```tsx
// src/renderer/components/dialogs/InstallSkillDialog.tsx
// Modal with a source input and a live progress area. Listens to
// package.progress PiEvents during install.

import React from "react";
import { onPiEvent } from "../../ipc";
import { useInstallSkill } from "../../queries";

interface InstallSkillDialogProps {
    open: boolean;
    onClose: () => void;
}

interface ProgressLine {
    phase: string;
    message: string;
}

export function InstallSkillDialog({ open, onClose }: InstallSkillDialogProps) {
    const [source, setSource] = React.useState("");
    const [progress, setProgress] = React.useState<ProgressLine[]>([]);
    const install = useInstallSkill();

    React.useEffect(() => {
        if (!open) return;
        return onPiEvent((raw) => {
            const e = raw as { type: string; phase: string; action: string; source: string; message?: string };
            if (e.type !== "package.progress") return;
            setProgress((prev) => [
                ...prev,
                { phase: e.phase, message: `${e.action} ${e.source}${e.message ? ` — ${e.message}` : ""}` },
            ]);
        });
    }, [open]);

    if (!open) return null;

    const handleInstall = () => {
        setProgress([]);
        install.mutate(
            { source: source.trim() },
            {
                onSuccess: () => {
                    setSource("");
                    onClose();
                },
            },
        );
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss via onClick
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            onKeyDown={() => undefined}
            role="presentation"
        >
            <div
                className="surface-panel flex w-[480px] flex-col gap-3 rounded p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={() => undefined}
                role="dialog"
                aria-modal="true"
                aria-label="Install skill"
            >
                <div className="text-sm font-semibold">Install skill</div>
                <input
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="npm package name, git URL, or local path"
                    className="surface-row rounded px-2 py-1 text-sm"
                />
                {progress.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded surface-row p-2 text-xs text-muted">
                        {progress.map((p, i) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: progress lines have no stable id
                            <div key={i}>
                                <span className="mr-2 text-[10px] uppercase tracking-widest">
                                    {p.phase}
                                </span>
                                {p.message}
                            </div>
                        ))}
                    </div>
                )}
                {install.isError && (
                    <div className="text-xs text-red-300">
                        {(install.error as Error).message}
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={install.isPending}
                        className="surface-row rounded px-3 py-1 text-xs disabled:opacity-40 hover:opacity-80"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleInstall}
                        disabled={!source.trim() || install.isPending}
                        className="surface-row rounded px-3 py-1 text-xs disabled:opacity-40 hover:opacity-80"
                    >
                        {install.isPending ? "Installing…" : "Install"}
                    </button>
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Wire from SkillsMode**

```tsx
<InstallSkillDialog open={installOpen} onClose={() => setInstallOpen(false)} />
```

- [ ] **Step 4: Verify + Commit**

```
cd /Users/roaanv/mycode/macpi && git add src/renderer/components/dialogs/InstallSkillDialog.tsx src/renderer/components/SkillsMode.tsx src/renderer/queries.ts
cd /Users/roaanv/mycode/macpi && git commit -m "feat(skills): install dialog with live progress"
```

---

## Task 17: Import-from-pi modal + reload banner

**Files:**
- Create: `src/renderer/components/dialogs/ImportFromPiDialog.tsx`
- Create: `src/renderer/components/banners/SkillsChangedBanner.tsx`
- Modify: `src/renderer/components/SkillsMode.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`
- Modify: `src/renderer/state/timeline-state.ts`
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Import mutation + dialog**

```ts
export function useImportSkillsFromPi() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => invoke("skills.importFromPi", {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["skills.list"] }),
    });
}
```

```tsx
// src/renderer/components/dialogs/ImportFromPiDialog.tsx
// Minimal confirmation modal. Phase 1 doesn't pre-list files; we just
// surface the count after the import completes.

import React from "react";
import { useImportSkillsFromPi } from "../../queries";

interface ImportFromPiDialogProps {
    open: boolean;
    onClose: () => void;
}

export function ImportFromPiDialog({ open, onClose }: ImportFromPiDialogProps) {
    const importMutation = useImportSkillsFromPi();
    const [result, setResult] = React.useState<{ copied: number; skipped: number } | null>(null);

    React.useEffect(() => {
        if (!open) setResult(null);
    }, [open]);

    if (!open) return null;

    const handleImport = () => {
        importMutation.mutate(undefined, {
            onSuccess: (data) => setResult(data),
        });
    };

    return (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={onClose}
            onKeyDown={() => undefined}
            role="presentation"
        >
            <div
                className="surface-panel flex w-[420px] flex-col gap-3 rounded p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={() => undefined}
                role="dialog"
                aria-modal="true"
                aria-label="Import from ~/.pi"
            >
                <div className="text-sm font-semibold">Import skills from ~/.pi</div>
                <div className="text-xs text-muted">
                    Copies top-level files from ~/.pi/skills into your resource root.
                    Files that already exist in macpi are skipped (never overwritten).
                </div>
                {result && (
                    <div className="text-xs text-emerald-300">
                        Imported {result.copied} file(s); skipped {result.skipped}.
                    </div>
                )}
                {importMutation.isError && (
                    <div className="text-xs text-red-300">
                        {(importMutation.error as Error).message}
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="surface-row rounded px-3 py-1 text-xs hover:opacity-80"
                    >
                        {result ? "Close" : "Cancel"}
                    </button>
                    {!result && (
                        <button
                            type="button"
                            onClick={handleImport}
                            disabled={importMutation.isPending}
                            className="surface-row rounded px-3 py-1 text-xs disabled:opacity-40 hover:opacity-80"
                        >
                            {importMutation.isPending ? "Importing…" : "Import"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Track skills-changed in timeline-state**

In `src/renderer/state/timeline-state.ts`:

1. Add `skillsChanged: boolean` to `TimelineSnapshot` (initialised `false` in `EMPTY`).
2. Add a new reducer case for `package.progress` with `phase === "complete"` — flip `skillsChanged` to `true`.
3. On `session.turn_start` clear it (a reload + new turn = no longer dirty).

Also expose a way to mark from outside: `skills.save` (renderer-side) should call into a setter. Simplest: add a renderer-level event `window.dispatchEvent(new CustomEvent("macpi:skills-changed"))` from the save/setEnabled/install/remove/import mutation `onSuccess` handlers, and listen for it in `useTimeline`. That keeps the wiring loose.

```ts
// in useTimeline:
React.useEffect(() => {
    if (!piSessionId) return;
    const onChange = () => setSnapshot((prev) => ({ ...prev, skillsChanged: true }));
    window.addEventListener("macpi:skills-changed", onChange);
    return () => window.removeEventListener("macpi:skills-changed", onChange);
}, [piSessionId]);
```

In `src/renderer/queries.ts`, update the four mutations (`useSaveSkill`, `useSetSkillEnabled`, `useInstallSkill`, `useImportSkillsFromPi`) to dispatch the event in `onSuccess`:

```ts
onSuccess: () => {
    qc.invalidateQueries(...);
    window.dispatchEvent(new CustomEvent("macpi:skills-changed"));
},
```

- [ ] **Step 3: SkillsChangedBanner**

```tsx
// src/renderer/components/banners/SkillsChangedBanner.tsx
// Banner above the composer: skills changed; offer Reload session.

interface SkillsChangedBannerProps {
    changed: boolean;
    onReload: () => void;
    reloading: boolean;
}

export function SkillsChangedBanner({ changed, onReload, reloading }: SkillsChangedBannerProps) {
    if (!changed) return null;
    return (
        <div
            role="status"
            className="flex items-center gap-2 rounded border-l-2 border-amber-500 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
        >
            <span className="flex-1">
                Skills changed — reload the session to apply.
            </span>
            <button
                type="button"
                onClick={onReload}
                disabled={reloading}
                className="rounded border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-40"
            >
                {reloading ? "Reloading…" : "Reload session"}
            </button>
        </div>
    );
}
```

- [ ] **Step 4: Wire from ChatPane + reload mutation**

In `src/renderer/queries.ts`:

```ts
export function useReloadSession() {
    return useMutation({
        mutationFn: (input: { piSessionId: string }) =>
            invoke("session.reload", input),
    });
}
```

In `src/renderer/components/ChatPane.tsx`, render the banner inside the banner stack:

```tsx
<SkillsChangedBanner
    changed={snapshot.skillsChanged}
    reloading={reload.isPending}
    onReload={() => piSessionId && reload.mutate({ piSessionId })}
/>
```

After successful reload, the in-process session is recreated and a new `piSessionId` would NOT change (we reattach the same id), so we need to manually clear `skillsChanged`. Easiest: dispatch a synthetic clear event in `onSuccess`:

```ts
// in useReloadSession:
onSuccess: () => {
    window.dispatchEvent(new CustomEvent("macpi:skills-changed-cleared"));
},
```

And listen for it alongside the set event in `useTimeline`.

- [ ] **Step 5: Wire ImportFromPiDialog from SkillsMode**

```tsx
<ImportFromPiDialog open={importOpen} onClose={() => setImportOpen(false)} />
```

- [ ] **Step 6: Verify + Commit**

```
cd /Users/roaanv/mycode/macpi && git add -u && git commit -m "feat(skills): import dialog + reload-session banner"
```

---

## Task 18: Final gates + manual smoke

**Files:** none.

- [ ] **Step 1: Full suite**

```
cd /Users/roaanv/mycode/macpi && npm run typecheck
cd /Users/roaanv/mycode/macpi && npx biome check --error-on-warnings src/ tests/
cd /Users/roaanv/mycode/macpi && npm run test
```

Expected: typecheck clean, biome clean, all tests pass (existing 163 + new ~16).

- [ ] **Step 2: Manual smoke**

1. Launch the app. Settings → Defaults: confirm "Resource root" shows `~/.macpi` and the directory was auto-created.
2. Click the skills mode in the rail. Empty-state list appears with "+ Install…" and "Import from ~/.pi" buttons.
3. (If you have ~/.pi skills) Click Import → confirmation modal → confirm → list refreshes with imported skills.
4. Open Install dialog → enter a known local-path source → install completes; progress events scroll; new skill appears in list.
5. Select a skill → manifest header + markdown editor appear. Edit the body, click Save. Verify the file on disk changed.
6. In Chat mode with a session open: edit a skill in Skills mode. Return to Chat. Reload-session banner appears. Click Reload session. Banner clears; chat history is preserved; in-flight turn (if any) is aborted.
7. Toggle a skill's enabled checkbox in the list. Reload banner appears.
8. Change Resource root in Defaults to a new directory. Verify ~/.macpi files don't move; new sessions look in the new directory.

---

## Self-Review

**Spec coverage:** Every clause of `docs/superpowers/specs/2026-05-11-macpi-skills-management-design.md` is implemented:

- §1.1 / §1.2 Isolation + configurable root → Tasks 1, 2, 3, 5
- §1.3 Skills-only phase → All tasks scope to skills; mode rail flip + view in 12, 13, 15
- §2 SDK surface → Tasks 5, 6, 9, 11 (ResourceLoader, PackageManager, reload via dispose+attach)
- §3 Data model (resourceRoot + resourceEnabled keys, id scheme, no new tables) → Tasks 1, 4
- §4 UI (mode rail, layout, install dialog, banner, detail editor) → Tasks 12-17
- §5 Reload mechanism → Task 11 + Task 17 banner
- §6 Import from ~/.pi → Task 10
- §7 IPC contract (8 methods) → Tasks 7, 8, 9, 10, 11
- §8 Test strategy → Unit + integration tests landed alongside each task
- §9 CodeMirror dependency → Task 14
- §10 Open implementation questions → Plan acknowledges these; their resolution surfaces during implementation, not pre-planned

**Placeholder scan:** No "TBD" / "TODO" / "implement later" markers. Every code step has the actual code.

**Type consistency:**
- `SkillSummary`, `SkillManifest` (defined Task 6, used Tasks 7, 13, 15) ✓
- `PiImportResult` (defined Task 10, used IPC + dialog) ✓
- `package.progress` PiEvent variant (Task 9, consumed in Tasks 16, 17 via timeline-state) ✓
- `SkillsServiceDeps.loadSkills` / `loadPackageManager` (Task 6, 9) signature stays consistent ✓
- `PiSessionManager.reloadSession(piSessionId)` (Task 11) matches IPC `session.reload` shape ✓
- `useSkills`, `useSkillDetail`, `useSaveSkill`, `useSetSkillEnabled`, `useInstallSkill`, `useImportSkillsFromPi`, `useReloadSession` — all hooks consistent in invalidation patterns ✓
