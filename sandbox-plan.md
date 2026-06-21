# MacPi sandboxed Pi SDK plan

## Goal

Keep using `@earendil-works/pi-coding-agent` in-process, but move Pi runtime state out of `~/.pi/agent` into a MacPi-owned agent root, and make MacPi-installed npm packages live under that root.

Target layout:

```text
~/.macpi/
  auth.json
  models.json
  pi-agent/
    settings.json
    sessions/
    skills/
    extensions/
    prompts/
    themes/
    git/
    npm/
      lib/node_modules/
      bin/
```

Note: with the current Pi SDK package manager, user-scope npm installs use `npm install -g`. Redirecting via `npm --prefix <agentDir>/npm` stores packages under `<agentDir>/npm/lib/node_modules`, not `<agentDir>/npm/node_modules`.

## Current state

- MacPi already uses the Pi SDK, not a `pi` CLI subprocess.
  - `src/main/pi-session-manager.ts` dynamically imports `@earendil-works/pi-coding-agent`.
- MacPi auth/model files are already app-owned.
  - `src/main/model-auth-service.ts` stores `auth.json` and `models.json` under `macpiRoot`.
- Pi resources/package settings/sessions still use `~/.pi/agent`.
  - `src/main/pi-agent-root.ts` returns `path.join(homeDir, ".pi", "agent")`.
  - `PiSessionManager` passes that root to `DefaultResourceLoader` and `DefaultPackageManager`.
  - `createAgentSession` calls currently omit `agentDir`, so SDK defaults can still fall back to Pi’s global root.

## Design

Introduce a first-class MacPi Pi runtime root:

```ts
export function getMacPiAgentRoot(macpiRoot: string): string {
  return path.join(macpiRoot, "pi-agent");
}
```

Pass this root explicitly to every SDK object that can otherwise default to `~/.pi/agent`:

- `DefaultResourceLoader({ cwd, agentDir, settingsManager, ... })`
- `DefaultPackageManager({ cwd, agentDir, settingsManager })`
- `SettingsManager.create(cwd, agentDir)`
- `createAgentSession({ cwd, agentDir, ... })`

Use a shared helper for SDK settings managers:

```ts
function createMacPiPiSettingsManager(
  mod: PiCodingModule,
  cwd: string,
  agentDir: string,
): SettingsManager {
  const settingsManager = mod.SettingsManager.create(cwd, agentDir);
  settingsManager.applyOverrides({
    npmCommand: ["npm", "--prefix", path.join(agentDir, "npm")],
  });
  return settingsManager;
}
```

This makes Pi SDK package-manager calls use MacPi’s npm prefix:

```text
npm --prefix <agentDir>/npm install -g <pkg>
npm --prefix <agentDir>/npm root -g
```

Add `<agentDir>/npm/bin` to PATH around package installs and session startup so extension-provided executables can be found.

## Implementation phases

### Phase 1 — Root plumbing

1. Replace `src/main/pi-agent-root.ts` with MacPi-owned semantics.
   - Rename or add helpers:
     - `getMacPiPiAgentRoot(macpiRoot: string): string`
     - `ensureMacPiPiAgentRoot(macpiRoot: string): string`
   - Do not derive this from `os.homedir()` directly.

2. Extend `PiSessionManagerDeps` in `src/main/pi-session-manager.ts`.
   - Replace `homeDir: string` with `agentDir: string`.
   - Keep `homeDir` only if needed for migration/import messaging; do not use it for runtime paths.

3. Wire `src/main/index.ts`.
   - After `macpiRoot = ensureResourceRoot(...)`, compute:
     ```ts
     const piAgentDir = ensureMacPiPiAgentRoot(macpiRoot);
     ```
   - Pass `agentDir: piAgentDir` to:
     - `PiSessionManager`
     - `SkillsService`
     - `ExtensionsService`
     - `PromptsService`

Acceptance:
- No production Pi runtime path is constructed as `os.homedir()/.pi/agent` except import-from-Pi UX.

### Phase 2 — SDK settings/resource/session construction

1. Add a private settings-manager helper in `PiSessionManager`.
   - Inputs: `ctx`, `cwd`.
   - Uses `this.deps.agentDir`.
   - Applies npm prefix override.

2. Update resource loader creation.
   - `buildResourceLoader` should use:
     - `agentDir: this.deps.agentDir`
     - shared settings manager or a settings manager created with the same root.
   - Enabled-resource filters must compute relative paths against this agent root.

3. Update one-shot loaders.
   - `loadSkills`
   - `loadPrompts`
   - `loadExtensions`
   - Each uses `DefaultResourceLoader({ cwd: app cwd or agentDir-safe cwd, agentDir, settingsManager })`.

4. Update package manager creation.
   - `loadPackageManager` uses:
     ```ts
     const settingsManager = createMacPiPiSettingsManager(ctx.mod, cwd, agentDir);
     const pm = new ctx.mod.DefaultPackageManager({ cwd, agentDir, settingsManager });
     ```
   - Use a stable cwd. Existing behavior uses home dir; replacement can use `agentDir` or a configured app cwd because global installs are now rooted by `agentDir`.

5. Update every `createAgentSession` call.
   - `createSession`
   - `attachSession`
   - `attachSessionByFile`
   - Pass `agentDir` and the matching `settingsManager`.

Acceptance:
- SDK defaults cannot choose `~/.pi/agent` for sessions, settings, packages, or resources.

### Phase 3 — npm sandboxing

1. Implement PATH augmentation for MacPi package/session execution.
   - Add `<agentDir>/npm/bin` to PATH before current PATH.
   - Use existing proxy-env wrappers as the point to merge env values, or add a sibling helper.

2. Ensure npm prefix directory exists before install.
   - Create `<agentDir>/npm` before package operations.

3. Preserve user-configurable npm command if needed.
   - Conservative first version: MacPi owns `npmCommand` override for package installs.
   - If later exposing UI, store MacPi-specific npm command separately and compose it with `--prefix <agentDir>/npm`.

Acceptance:
- Installing `npm:<pkg>` through MacPi writes under `<agentDir>/npm`.
- `DefaultPackageManager.listConfiguredPackages()` reports installed paths under the MacPi root.

### Phase 4 — Services and IDs

Update root-relative ID calculations:

- `src/main/skills-service.ts`
  - `resourceRoot()` returns `agentDir`.
  - skill relative paths are against `<agentDir>/skills`.

- `src/main/extensions-service.ts`
  - `extensionsRoot()` returns `<agentDir>/extensions`.

- `src/main/prompts-service.ts`
  - `resourceRoot()` returns `agentDir`.
  - prompt relative paths are against `<agentDir>/prompts`.

Keep install/remove behavior through the SDK package manager:

```ts
pm.installAndPersist(source, { local: false });
pm.removeAndPersist(source, { local: false });
```

Acceptance:
- Existing UI enable/disable settings still key resources consistently.
- Installed package resources list/read/save from the MacPi agent root.

### Phase 5 — Session discovery and migration UX

1. Update session fallback discovery.
   - `discoverSessionFile(piSessionId)` must search `<agentDir>/sessions`, not `~/.pi/agent/sessions`.
   - Error text should name the MacPi root.

2. Keep explicit import from Pi global auth/models.
   - `ModelAuthService.getImportStatus(homeDir)` can continue reading `~/.pi/agent/auth.json` and `models.json` because that is an intentional import feature.

3. Decide migration behavior.
   - Minimum safe cutover: new MacPi root starts empty; users can import auth/models via existing UI.
   - Optional migration prompt later: copy selected resources from `~/.pi/agent` to `<macpiRoot>/pi-agent`.

Acceptance:
- New sessions are created under `<agentDir>/sessions`.
- Reattaching a MacPi-created session works after app restart.
- Global Pi sessions do not leak into MacPi unless imported by an explicit feature.

### Phase 6 — Tests

Add/update focused tests.

1. Unit test root helper.
   - Given `/tmp/macpi`, returns `/tmp/macpi/pi-agent` and creates it.

2. PiSessionManager tests.
   - Mock Pi SDK constructors and assert `agentDir` is passed to:
     - `DefaultResourceLoader`
     - `DefaultPackageManager`
     - `SettingsManager.create`
     - `createAgentSession`
   - Assert settings manager receives npm override:
     ```ts
     ["npm", "--prefix", path.join(agentDir, "npm")]
     ```

3. Service tests.
   - Skills/extensions/prompts compute IDs relative to `<agentDir>/<kind>`.

4. Integration test.
   - Install package through service with fake package manager.
   - Assert service calls `installAndPersist(source, { local: false })` and progress events still emit.

5. Session path test.
   - Fallback discovery searches `<agentDir>/sessions`.

Verification commands:

```bash
npm test -- --run tests/integration/pi-session-manager-global-package-manager.test.ts
npm test -- --run tests/integration/skills-service.test.ts tests/integration/extensions-service.test.ts
npm test -- --run tests/unit/*resource*.test.ts
npm run typecheck
```

Run narrower commands if filenames differ after implementation.

## Risks and decisions

### Risk: npm layout is `npm/lib/node_modules`

Current SDK user npm install path is driven by `npm install -g` and `npm root -g`. With `npm --prefix <agentDir>/npm`, npm uses:

```text
<agentDir>/npm/lib/node_modules
<agentDir>/npm/bin
```

Decision: accept this as “under `agentDir/npm`” for first implementation. If exact `agentDir/npm/node_modules` is required, implement a MacPi package manager adapter or update the Pi SDK.

### Risk: SDK defaults silently use global Pi state

Any missed constructor can fall back to `~/.pi/agent`.

Decision: add tests around every SDK construction point and search for `createAgentSession`, `DefaultResourceLoader`, `SettingsManager.create`, `DefaultPackageManager`, and `SessionManager.create/open` during review.

### Risk: existing users lose visible resources/sessions after cutover

Sandboxing intentionally changes the root.

Decision: do not silently copy arbitrary executable extensions/skills from global Pi. Provide explicit import/migration later if needed.

### Risk: user `npmCommand` conflicts with MacPi prefix

Pi supports `npmCommand`, but MacPi needs a forced prefix for sandboxing.

Decision: first implementation owns `npmCommand` internally. Expose advanced configuration only after the sandbox invariant is tested.

## Definition of done

- MacPi starts a Pi SDK session with explicit MacPi-owned `agentDir`.
- New sessions persist under `<macpiRoot>/pi-agent/sessions`.
- Skills/extensions/prompts are discovered from `<macpiRoot>/pi-agent` and project `.pi` directories only.
- Package installs persist source entries to `<macpiRoot>/pi-agent/settings.json`.
- npm package payloads install under `<macpiRoot>/pi-agent/npm`.
- No normal runtime path requires or mutates `~/.pi/agent`; only explicit import-from-Pi UI reads it.
- Focused tests and `npm run typecheck` pass.
