# Shared Global Pi Environment Implementation Plan

**Goal:** Rework MacPi from an isolated Pi runtime into a GUI over the user's normal global Pi environment. Pi resources, packages, extensions, skills, prompts, themes, package settings, package installs, extension runtime data, and extension side effects should match what the `pi` CLI uses by default.

**Strategy statement:** MacPi is not a separate Pi installation. MacPi is a desktop UI for global Pi. The source of truth for Pi runtime resources is:

```text
~/.pi/agent
```

MacPi-specific UI/application state may remain in Electron userData / MacPi DB / `~/.macpi` where appropriate, but Pi-owned state should not be duplicated or migrated into a MacPi-specific package/resource store.

---

## Current code that conflicts with this strategy

The recent isolated-install work introduced these now-wrong concepts:

- MacPi package store under:
  ```text
  ~/.macpi/packages/...
  ~/.macpi/.install-tmp/...
  ~/.macpi/npm-cache
  ```
- `package_installs` DB table and repository as MacPi metadata source of truth.
- `DefaultMacPiPackageInstaller` that installs npm/git/local packages into MacPi-owned storage and rewrites Pi settings to local package paths.
- `PiPackageSettingsAdapter` for writing local paths to MacPi-scoped Pi settings.
- `migrateLegacyPackageInstalls()` that migrates old installs into `~/.macpi/packages`.
- `PiSessionManager.loadPackageManager()` facade that hides Pi's actual package manager behind MacPi metadata.
- service-level `resolvePackageSource` mapping from local package path back to original `npm:` / `git:` sources.
- `configureNpmGlobalPrefix(macpiRoot)` at app boot, which redirects Pi's global npm installs into `~/.macpi/npm-global`.
- resource root default of `~/.macpi` for Pi's `DefaultResourceLoader` / `DefaultPackageManager`.
- “Import from Pi” UX for extensions because it assumed MacPi and Pi were separate stores.

These should be removed or changed.

---

## Target architecture

### Pi runtime root

Introduce one explicit helper for Pi's global agent root:

```ts
export function getGlobalPiAgentRoot(homeDir: string): string {
  return path.join(homeDir, ".pi", "agent");
}
```

Use this for:

- `DefaultResourceLoader.agentDir`
- `DefaultPackageManager.agentDir`
- `SettingsManager.create(homeDir, agentDir)`
- resource list/read/edit paths
- global package install/remove/update

### MacPi app state

Continue using MacPi app DB for:

- channels
- UI state
- session/channel metadata
- selected model settings if they are MacPi UI preferences
- MacPi-specific toggles if they intentionally differ from CLI Pi

Do **not** use MacPi DB as the source of truth for installed Pi packages.

### Package installation

MacPi install should delegate to Pi's normal package manager:

```ts
const settingsManager = SettingsManager.create(homeDir, globalPiAgentRoot);
const pm = new DefaultPackageManager({
  cwd: homeDir,
  agentDir: globalPiAgentRoot,
  settingsManager,
});
await pm.installAndPersist(source, { local: false });
```

This means:

- `npm:` global packages follow Pi's behavior (`npm install -g`) unless Pi itself changes.
- `git:` global packages go under `~/.pi/agent/git/...`.
- local package entries are recorded in `~/.pi/agent/settings.json` as Pi normally records them.
- CLI Pi and MacPi see the same packages.

### Resource discovery

MacPi list views should call Pi's loader pointed at global Pi:

```ts
new DefaultResourceLoader({ cwd, agentDir: globalPiAgentRoot, ... })
```

Then:

- extensions installed by CLI Pi appear in MacPi
- skills/prompts installed by CLI Pi appear in MacPi
- extensions installed by MacPi appear in CLI Pi

### Import UX

Remove “Import from Pi” flows for Pi resources because there is nothing to import. MacPi is already looking at Pi.

The UI may keep other import flows unrelated to Pi resources, such as model auth import, if still useful.

---

## Phase 1: Revert isolated package store as active runtime path

**Files to modify/remove:**

- Remove or stop using:
  - `src/main/macpi-package-installer.ts`
  - `src/main/package-store.ts`
  - `src/main/package-store-migration.ts`
  - `src/main/pi-package-settings-adapter.ts`
  - `src/main/repos/package-installs.ts`
- Remove migration if possible:
  - `src/main/db/migrations/0006-package_installs.sql`
- Adjust schema version if migration is removed.

**Important migration decision:**

If the current branch has not shipped, delete the migration and set schema max back to the previous version.

If it has shipped to any user, do **not** delete the migration. Instead:

- leave the table harmlessly in place,
- stop writing to it,
- remove runtime dependency on it,
- optionally add a later cleanup migration.

Given this is still in active development, prefer deleting the isolated-install DB migration before release.

**Acceptance:**

- No production runtime code imports `DefaultMacPiPackageInstaller`, `PackageInstallsRepo`, `PiPackageSettingsAdapter`, or package-store helpers.
- Typecheck passes.

---

## Phase 2: Point PiSessionManager at global Pi root

**Files:**

- `src/main/pi-session-manager.ts`
- `src/main/resource-root.ts` or new `src/main/pi-agent-root.ts`
- `src/shared/app-settings-keys.ts` if it currently exposes Pi resource root settings
- tests for resource root behavior

**Change:**

Replace use of MacPi `resourceRoot` for Pi runtime with global Pi root:

```ts
const agentDir = path.join(homeDir, ".pi", "agent");
```

in:

- `buildResourceLoader`
- `loadSkills`
- `loadPrompts`
- `loadExtensions`
- `listConfiguredPiPackages` if it remains
- `loadPackageManager`

Keep MacPi's own app root separate if needed for `NOTES.md`, app DB, logs, etc.

**Acceptance:**

- `DefaultResourceLoader` receives `~/.pi/agent`.
- `DefaultPackageManager` receives `~/.pi/agent`.
- `SettingsManager.create(homeDir, agentDir)` points at `~/.pi/agent`.
- Tests prove resources under a fake `home/.pi/agent` are listed by MacPi services.

---

## Phase 3: Restore raw Pi package manager behavior

**Files:**

- `src/main/pi-session-manager.ts`
- services using `loadPackageManager()`:
  - `src/main/extensions-service.ts`
  - `src/main/skills-service.ts`
  - `src/main/prompts-service.ts`
- tests around package manager facade

**Change:**

`PiSessionManager.loadPackageManager()` should return a thin wrapper over Pi's `DefaultPackageManager`, not MacPi's isolated installer.

Expected shape:

```ts
const settingsManager = ctx.mod.SettingsManager.create(homeDir, globalPiAgentRoot);
const pm = new ctx.mod.DefaultPackageManager({
  cwd: homeDir,
  agentDir: globalPiAgentRoot,
  settingsManager,
});
return {
  listConfiguredPackages: () => pm.listConfiguredPackages(),
  installAndPersist: (source, options) => withProxyEnv(..., () => pm.installAndPersist(source, options)),
  removeAndPersist: (source, options) => withProxyEnv(..., () => pm.removeAndPersist(source, options)),
  update: (source) => withProxyEnv(..., () => pm.update(source)),
  setProgressCallback: (cb) => pm.setProgressCallback(cb),
};
```

**Remove:**

- `resolvePackageSource` mapping from services and session filters.
- references to MacPi package metadata.

**Acceptance:**

- Installing through MacPi writes to `~/.pi/agent/settings.json`.
- Git package installs use `~/.pi/agent/git/...`.
- Npm package install behavior matches CLI Pi.
- MacPi package list shows actual Pi configured package sources.

---

## Phase 4: Remove npm global prefix redirection

**Files:**

- `src/main/index.ts`
- `src/main/npm-global-prefix.ts`
- `tests/unit/npm-global-prefix.test.ts`

**Change:**

Remove app boot call:

```ts
configureNpmGlobalPrefix(macpiRoot)
```

Because the new strategy intentionally shares global Pi. MacPi should not redirect Pi's global npm commands into `~/.macpi/npm-global`.

Then either:

- delete `npm-global-prefix.ts` and its tests, or
- keep it unused only if there is another non-Pi use case. Prefer deletion.

**Acceptance:**

- MacPi no longer sets `process.env.npm_config_prefix` for Pi package installs.
- Tests no longer expect the MacPi npm prefix behavior.

---

## Phase 5: Remove Import-from-Pi resource UX

**Files likely affected:**

- `src/main/ipc-router.ts`
- `src/shared/ipc-types.ts`
- `src/renderer/components/dialogs/ImportFromPiDialog.tsx`
- `src/renderer/components/ExtensionsList.tsx`
- `src/renderer/components/SkillsMode` / skills list components
- `src/renderer/components/PromptsMode` / prompts list components
- `src/renderer/queries.ts`
- tests for IPC import/list Pi resources

**Change:**

Remove resource import APIs:

- `resources.listPiResources`
- `resources.importPiResources`

Remove buttons/menu entries labeled “Import from Pi” for:

- extensions
- skills
- prompts

Keep install buttons where users type a Pi package source (`npm:...`, `git:...`, local path), because those install into global Pi.

**Acceptance:**

- No Import-from-Pi button for Pi resources.
- No IPC route for importing Pi resources into MacPi.
- No renderer query/mutation for resource import from Pi.
- Existing resources are shown directly because loader points at global Pi.

---

## Phase 6: Adjust resource editing semantics

**Files:**

- `src/main/extensions-service.ts`
- `src/main/skills-service.ts`
- `src/main/prompts-service.ts`
- tests for read/save/list

**Question to decide:** should MacPi allow editing global Pi resource files directly?

If yes:

- reading/saving extensions/skills/prompts edits files under `~/.pi/agent` or package install locations.
- UI should make this clear because changes affect CLI Pi.

If no:

- disable editing packaged resources and allow editing only user-owned top-level resources under:
  ```text
  ~/.pi/agent/extensions
  ~/.pi/agent/skills
  ~/.pi/agent/prompts
  ```

Recommended first cut: preserve current edit behavior but make source paths/tooltips clear. Do not silently fork resources into MacPi.

**Acceptance:**

- Read/save tests use fake `home/.pi/agent`, not `.macpi`.
- Resource IDs use Pi source info directly.

---

## Phase 7: Update settings UI and wording

**Files:**

- settings components exposing `resourceRoot`
- labels/tooltips mentioning MacPi resource root
- documentation/plan files if surfaced in app

**Change:**

Remove or rename `resourceRoot` setting if it was intended to mean “where Pi resources live.” Under this strategy, Pi resources always live in global Pi.

Possible replacement wording:

- “Pi environment: Global (`~/.pi/agent`)”
- “MacPi app data: Electron userData / MacPi DB”

Do not offer a MacPi resource root selector unless the product intentionally supports non-global Pi profiles later.

**Acceptance:**

- UI does not imply extensions are isolated in MacPi.
- Users can understand that MacPi and CLI Pi share packages and resources.

---

## Phase 8: Tests for shared global behavior

Add or update tests to prove:

1. MacPi lists extensions from fake global Pi root:
   ```text
   <home>/.pi/agent/extensions/a.ts
   ```

2. MacPi lists skills from fake global Pi root:
   ```text
   <home>/.pi/agent/skills/foo/SKILL.md
   ```

3. MacPi package install delegates to Pi's `DefaultPackageManager` pointed at fake global Pi root.

4. No code writes Pi package settings to `.macpi/settings.json`.

5. `resources.importPiResources` IPC route no longer exists.

6. Global package records from `pm.listConfiguredPackages()` are displayed as-is.

---

## Phase 9: Cleanup obsolete tests and docs

Remove tests that assert isolated behavior:

- isolated package installer tests
- package store tests
- package store migration tests
- pi loader tests specifically for isolated local package paths
- npm global prefix tests if the module is deleted

Remove or archive obsolete plan:

- `2026-05-31-macpi-isolated-package-installs.md`

Keep this plan as the new source of truth.

---

## Phase 10: Verification

Run:

```bash
npm run typecheck
npm run test
npm run lint
make run
```

Manual QA:

1. Install package with CLI Pi:
   ```bash
   pi install npm:pi-hermes-memory
   ```
   Open MacPi and verify extension appears.

2. Install package with MacPi:
   ```text
   npm:pi-hermes-memory
   ```
   Then run CLI:
   ```bash
   pi list
   ```
   Verify package appears.

3. Verify package data writes to global Pi as package expects:
   ```text
   ~/.pi/agent/pi-hermes-memory/
   ~/.pi/agent/projects-memory/
   ~/.pi/agent/pi-hermes-memory/sessions.db
   ```

4. Verify MacPi no longer creates package installs under:
   ```text
   ~/.macpi/packages
   ~/.macpi/npm-global
   ```

---

## Non-goals

- Do not sandbox extension runtime.
- Do not patch third-party packages to write into MacPi paths.
- Do not maintain a separate MacPi package registry.
- Do not auto-import/copy global Pi resources.

---

## Expected user-facing behavior after completion

MacPi behaves like a desktop UI for Pi:

- Same packages as CLI Pi.
- Same extensions as CLI Pi.
- Same skills/prompts as CLI Pi.
- Same extension data locations as CLI Pi.
- Installing/removing in either interface affects the other.
