# Custom Providers and Keychain Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate local providers to custom providers, secure all API keys in macOS Keychain, support model-less custom setup and manual/fetched models, and add a searchable default-model popup.

**Architecture:** Introduce a testable main-process Keychain boundary and typed non-secret credential references, then make ModelAuthService own credential hydration/migrations and custom-model persistence. Renderer screens consume typed IPC operations and never read secrets back.

**Tech Stack:** TypeScript, Node `execFile`, macOS `security`, Electron IPC, Pi AuthStorage/ModelRegistry, React 18, TanStack Query, Vitest/jsdom, Biome.

---

### Task 1: Keychain store and typed references

**Files:**
- Create: `src/main/keychain-credential-store.ts`
- Modify: `src/shared/app-settings-keys.ts`
- Create: `tests/unit/keychain-credential-store.test.ts`
- Modify: `tests/unit/app-settings-keys.test.ts`

- [ ] Run impact analysis for app-settings accessors.
- [ ] Write failing tests for managed read/write/update/delete, external validation, argument-array execution, sanitized errors, and malformed reference settings.
- [ ] Implement `KeychainCredentialStore` with injected `execFile` runner. Never invoke a shell and never include secret/stdout/stderr in errors.
- [ ] Add `ProviderKeychainReference { service, managed }`, `getProviderKeychainReferences`, and immutable update helpers for the non-secret `providerKeychainReferences` setting.
- [ ] Run focused tests, typecheck, Biome, full tests, detect changes, and commit `feat: add keychain credential store`.

### Task 2: Credential migration and runtime hydration

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/unit/model-auth-service.test.ts`

- [ ] Impact-analyze ModelAuthService initialization/auth flows and warn on HIGH/CRITICAL risk.
- [ ] Write failing tests for plaintext API-key migration success, read-back mismatch/failure rollback, OAuth exclusion, idempotency, runtime hydration, unreadable references, and sanitized diagnostics.
- [ ] Inject `KeychainCredentialStore` into ModelAuthService. During init, migrate stored API keys transactionally, persist references, remove plaintext only after verification, and apply `setRuntimeApiKey` for readable references.
- [ ] Refresh must rehydrate runtime overrides without persisting secrets.
- [ ] Wire production store in `main/index.ts`.
- [ ] Verify and commit `feat: migrate API keys to keychain`.

### Task 3: Keychain-backed provider authentication UI

**Files:**
- Modify: `src/shared/model-auth-types.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/ProvidersSettings.tsx`
- Modify: `tests/unit/providers-settings.test.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] Write failing tests for direct-key and external-service payloads, immediate validation, no secret response, replacing managed/external refs, and managed-only deletion.
- [ ] Replace API-key save input with a credential union:

```ts
type ApiKeyCredentialInput =
  | { mode: "apiKey"; apiKey: string }
  | { mode: "keychainService"; service: string };
```

- [ ] ModelAuthService writes/verifies managed items or validates external services, persists reference, applies runtime override, and removes prior managed item only after success.
- [ ] Logout removes reference/runtime override; deletes managed services only; OAuth behavior remains.
- [ ] Render labelled mode controls and corresponding API-key/service input for built-in and custom forms.
- [ ] Verify and commit `feat: store provider keys in keychain`.

### Task 4: Local-to-custom migration and zero-model provider setup

**Files:**
- Modify: `src/shared/model-auth-types.ts`
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/renderer/utils/model-provider-view.ts`
- Modify: `src/renderer/components/ProvidersSettings.tsx`
- Modify: `tests/unit/model-auth-service.test.ts`
- Modify: `tests/unit/model-provider-view.test.ts`
- Modify: `tests/unit/providers-settings.test.ts`

- [ ] Write failing migration tests for simple rename, collision merge, custom metadata precedence, model-ID dedupe, favourites/default/reference updates, managed service rename, external reference preservation, rollback, and idempotency.
- [ ] Implement startup migration from every `local-*` ID to `custom-*`, transactionally preserving source data until all writes succeed.
- [ ] Rename shared types from Local to Custom while retaining temporary parsing compatibility only where migration needs it.
- [ ] New provider IDs require `custom-`; provider classification and all runtime copy use Custom.
- [ ] Remove the service requirement for at least one model. Allow `models: []` and keep Fetch optional.
- [ ] Update Provider UI labels/filter/help/default ID and enable Save without models.
- [ ] Verify and commit `feat: migrate local providers to custom`.

### Task 5: Custom model persistence and Models controls

**Files:**
- Modify: `src/shared/model-auth-types.ts`
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/ModelsSettings.tsx`
- Modify: `tests/unit/model-auth-service.test.ts`
- Modify: `tests/integration/ipc-router.test.ts`
- Modify: `tests/unit/models-settings.test.ts`

- [ ] Write service tests for fetch using saved URL/Keychain key, merge-by-ID, explicit-name preservation, immediate add/update, remove, favourite cleanup, unchanged default, and file/refresh rollback.
- [ ] Add typed operations:
  - `modelsAuth.fetchCustomProviderModels`
  - `modelsAuth.saveCustomModel`
  - `modelsAuth.removeCustomModel`
- [ ] Keep file read/modify/write and Keychain resolution in ModelAuthService. Return only non-secret counts/model summaries.
- [ ] Add custom-only Models controls: Fetch Models, required ID, optional display name, Add, and visible Remove actions.
- [ ] Mutations invalidate provider/model/settings queries. Pending, success, and sanitized errors render inline.
- [ ] A zero-model custom provider remains selectable and shows management controls.
- [ ] Verify and commit `feat: manage custom provider models`.

### Task 6: Searchable default-model popup

**Files:**
- Create: `src/renderer/components/DefaultModelMenu.tsx`
- Modify: `src/renderer/components/DefaultModelSelector.tsx`
- Modify: `tests/unit/default-model-selector.test.ts`
- Create: `tests/unit/default-model-menu.test.ts`

- [ ] Impact-analyze DefaultModelSelector and the existing ChatModelMenu pattern.
- [ ] Write failing tests for trigger/current label, search, Automatic fallback, Favourites, grouped All, duplicate favourite visibility, unavailable saved default, pending dismissal guard, failure retry, focus restoration, and payloads.
- [ ] Implement an anchored searchable popup using existing model/settings queries and `useSetSelectedModel`. It changes only the default.
- [ ] Keep existing loading/query/registry/unavailable error presentation in the selector wrapper.
- [ ] Verify and commit `feat: add searchable default model menu`.

### Task 7: Final migration, security, and regression verification

- [ ] Run `npm test`, typecheck, targeted/full lint, package build, and diff checks.
- [ ] Run GitNexus compare-to-main detection and review every affected auth/settings/session flow.
- [ ] Inspect the complete diff for secret leakage: no API key in responses, logs, errors, snapshots, settings, or fixtures outside explicit fake values.
- [ ] Verify migration rollback/idempotency, custom collision behavior, managed/external deletion semantics, custom zero-model setup, model Fetch/Add/Remove, and default popup.
- [ ] Complete independent spec and code-quality reviews; fix and re-review all material findings.
