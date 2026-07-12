# Provider and Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split provider authentication from model favourites/defaults and add safe current-session model switching from the chat footer.

**Architecture:** Refactor the existing combined settings component into focused Provider, Model, DefaultModelSelector, and ChatModelMenu units backed by shared pure view utilities. Preserve existing auth/storage contracts, add one typed session-scoped model-switch IPC operation, and keep current-session selection independent from the saved new-session default.

**Tech Stack:** React 18, TypeScript, TanStack Query, Electron IPC, Pi AgentSession SDK, Vitest/jsdom, Biome.

---

## File structure

- Rename/split `src/renderer/components/ModelsAuthSettings.tsx` into `ProvidersSettings.tsx` plus reusable provider-auth subcomponents.
- Create `src/renderer/components/ModelsSettings.tsx` for configured-provider favourites.
- Create `src/renderer/components/DefaultModelSelector.tsx` and compose it into `DefaultsSettings.tsx`.
- Create `src/renderer/components/ChatModelMenu.tsx` and compose it into `ChatFooter.tsx`.
- Extend `src/renderer/utils/model-provider-view.ts` with pure configured-provider/model filtering and grouping.
- Extend `src/shared/ipc-types.ts`, `src/main/model-auth-service.ts`, `src/main/ipc-router.ts`, and `src/renderer/queries.ts` for session-scoped model switching.
- Update `src/renderer/components/GlobalSettingsDialog.tsx` and auth-error copy.
- Add focused unit/component/integration tests under `tests/unit` and `tests/integration`.

### Task 1: Shared provider/model view utilities

**Files:**
- Modify: `src/renderer/utils/model-provider-view.ts`
- Modify: `tests/unit/model-provider-view.test.ts`

- [ ] **Step 1: Run impact analysis before editing**

Run GitNexus impact for `buildProviderViews` and `filterProviderViews` in the worktree. Report direct consumers and stop for HIGH/CRITICAL risk. If unavailable, use exact import/caller searches and document the fallback.

- [ ] **Step 2: Write failing utility tests**

Add tests for configured-provider filtering, model search, and provider grouping:

```ts
expect(configuredProviderViews(views).map((p) => p.id)).toEqual(["anthropic"]);
expect(filterModels(views[0].models, "sonnet").map((m) => m.id)).toEqual(["claude-sonnet"]);
expect(groupModelsByProvider(views).map((g) => g.provider.id)).toEqual(["anthropic", "openai"]);
```

Include provider/model fixtures with configured and unconfigured auth.

- [ ] **Step 3: Run tests to verify RED**

Run: `npx vitest --run tests/unit/model-provider-view.test.ts`

Expected: FAIL because the new exports do not exist.

- [ ] **Step 4: Implement pure helpers**

Add these stable interfaces/functions:

```ts
export interface ProviderModelGroup {
  provider: ProviderView;
  models: ModelSummary[];
}

export const configuredProviderViews = (providers: readonly ProviderView[]) =>
  providers.filter((provider) => provider.authStatus.configured);

export function filterModels(models: readonly ModelSummary[], query: string): ModelSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...models];
  return models.filter((model) =>
    [model.name, model.id, model.providerName].join(" ").toLowerCase().includes(q),
  );
}

export function groupModelsByProvider(providers: readonly ProviderView[]): ProviderModelGroup[] {
  return configuredProviderViews(providers).map((provider) => ({
    provider,
    models: provider.models,
  }));
}
```

- [ ] **Step 5: Verify and commit**

Run focused tests, `npm run typecheck`, targeted Biome, and `git diff --check`.

```bash
git add src/renderer/utils/model-provider-view.ts tests/unit/model-provider-view.test.ts
git commit -m "test: define configured model views"
```

### Task 2: Compact Providers settings screen

**Files:**
- Create: `src/renderer/components/ProvidersSettings.tsx`
- Delete: `src/renderer/components/ModelsAuthSettings.tsx`
- Modify: `src/renderer/components/GlobalSettingsDialog.tsx`
- Modify: `src/renderer/components/banners/ErrorBanner.tsx`
- Create: `tests/unit/providers-settings.test.ts`

- [ ] **Step 1: Impact-analyze existing component symbols**

Run impact on `ModelsAuthSettings`, `ProviderDetail`, and `GlobalSettingsDialog`; warn before any HIGH/CRITICAL edit. Confirm the combined screen is consumed only by global settings.

- [ ] **Step 2: Write failing rendered tests**

Using the existing jsdom/React test pattern, mock queries and assert:

```ts
expect(screenText()).toContain("Providers");
expect(screenText()).not.toContain("Models & Auth");
expect(screenText()).not.toContain("Active:");
expect(buttonLabels()).not.toContain("Add to favourites");
```

Also assert the filter is a labelled select with All/Configured/Cloud/Local, Advanced and Import remain, local-provider action remains, and the model inventory starts collapsed then expands read-only.

- [ ] **Step 3: Run tests to verify RED**

Run: `npx vitest --run tests/unit/providers-settings.test.ts`

Expected: FAIL against the old combined UI.

- [ ] **Step 4: Split and compact the screen**

Move provider auth/local/import/advanced code into `ProvidersSettings.tsx`. Remove selected-model/favourite hooks and props. Replace filter chips with:

```tsx
<label className="sr-only" htmlFor="provider-filter">Filter providers</label>
<select id="provider-filter" value={filter} onChange={(e) => setFilter(e.target.value as ProviderFilter)}>
  <option value="all">All</option>
  <option value="configured">Configured</option>
  <option value="cloud">Cloud</option>
  <option value="local">Local</option>
</select>
```

Remove `favourites` from `ProviderFilter`. Render models under a disclosure:

```tsx
<details className="rounded border border-divider">
  <summary className="cursor-pointer px-3 py-2 text-sm">
    {provider.models.length} models available
  </summary>
  <ReadOnlyModelInventory models={provider.models} />
</details>
```

Use tighter sidebar/row/badge spacing and retain adequate targets.

- [ ] **Step 5: Update Settings navigation and error action copy**

Register `{ id: "providers", label: "Providers", render: () => <ProvidersSettings /> }`. Change “Open Models & Auth” to “Open Providers.”

- [ ] **Step 6: Verify regressions and commit**

Run provider tests, OAuth dialog tests, typecheck, targeted Biome, and full tests.

```bash
git add src/renderer/components/ProvidersSettings.tsx src/renderer/components/ModelsAuthSettings.tsx src/renderer/components/GlobalSettingsDialog.tsx src/renderer/components/banners/ErrorBanner.tsx tests/unit/providers-settings.test.ts
git commit -m "refactor: focus settings on providers"
```

### Task 3: Models favourites settings screen

**Files:**
- Create: `src/renderer/components/ModelsSettings.tsx`
- Modify: `src/renderer/components/GlobalSettingsDialog.tsx`
- Create: `tests/unit/models-settings.test.ts`

- [ ] **Step 1: Write failing rendered tests**

Test configured-provider-only left navigation, provider selection, name/ID search, favourite pressed state, toggle mutation payload, and empty states. Key assertion:

```ts
expect(providerLabels()).toEqual(["Anthropic"]); // unconfigured OpenAI omitted
expect(star.getAttribute("aria-pressed")).toBe("true");
expect(setSetting).toHaveBeenCalledWith({ key: "modelFavourites", value: [] });
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest --run tests/unit/models-settings.test.ts`

Expected: FAIL because `ModelsSettings` does not exist.

- [ ] **Step 3: Implement ModelsSettings**

Build provider views, call `configuredProviderViews`, keep selected provider stable, and use `filterModels`. Persist toggles through the existing `modelFavourites` setting. Star buttons use:

```tsx
<button
  type="button"
  aria-pressed={isFavourite}
  aria-label={`${isFavourite ? "Remove from" : "Add to"} favourites: ${model.name}`}
  onClick={() => toggleFavourite({ provider: model.provider, modelId: model.id })}
>
  <span aria-hidden>{isFavourite ? "★" : "☆"}</span>
</button>
```

Do not import or invoke `useSelectedModel`/`useSetSelectedModel`.

- [ ] **Step 4: Register the Models category**

Add `{ id: "models", label: "Models", group: "Workspace", render: () => <ModelsSettings /> }` after Providers.

- [ ] **Step 5: Verify and commit**

Run focused tests, typecheck, targeted Biome, and full tests.

```bash
git add src/renderer/components/ModelsSettings.tsx src/renderer/components/GlobalSettingsDialog.tsx tests/unit/models-settings.test.ts
git commit -m "feat: add model favourites settings"
```

### Task 4: Default model selector

**Files:**
- Create: `src/renderer/components/DefaultModelSelector.tsx`
- Modify: `src/renderer/components/DefaultsSettings.tsx`
- Create: `tests/unit/default-model-selector.test.ts`

- [ ] **Step 1: Write failing rendered tests**

Cover configured-provider grouping, current saved model, Automatic fallback, set/clear payloads, invalid saved model, and mutation errors:

```ts
expect(optionLabels()).toContain("Automatic fallback");
selectValue("anthropic\u0000claude-sonnet");
expect(setSelected).toHaveBeenCalledWith({ model: { provider: "anthropic", modelId: "claude-sonnet" } });
selectValue("");
expect(setSelected).toHaveBeenCalledWith({ model: null });
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npx vitest --run tests/unit/default-model-selector.test.ts`

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement DefaultModelSelector**

Use configured provider views and existing selected-model query/mutation. Provide an accessible search input plus grouped result selector/listbox; encode values with `modelRefKey` and decode locally. Preserve an unavailable saved default as an inline warning. Automatic fallback calls `{ model: null }`.

- [ ] **Step 4: Compose into Defaults**

Place under Default cwd with heading “Default model for new chats” and explanatory text that existing chats are unchanged.

- [ ] **Step 5: Verify and commit**

Run focused tests, existing app-settings/model-auth tests, typecheck, targeted Biome, and full tests.

```bash
git add src/renderer/components/DefaultModelSelector.tsx src/renderer/components/DefaultsSettings.tsx tests/unit/default-model-selector.test.ts
git commit -m "feat: configure the default model"
```

### Task 5: Session-scoped model-switch IPC

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Modify: `tests/unit/model-auth-service.test.ts`
- Modify: `tests/integration/ipc-router.test.ts`

- [ ] **Step 1: Impact-analyze all edited symbols**

Run impact for `IpcMethods`, `ModelAuthService`, `IpcRouter`, and `useSessionFooterStats`. Report process/caller blast radius and stop before HIGH/CRITICAL edits without user acknowledgement.

- [ ] **Step 2: Write failing service and router tests**

Add service resolution/auth validation tests and router tests for missing session, streaming, unknown model, unconfigured provider, success, and `setModel` rejection. The success test must assert:

```ts
expect(agentSession.setModel).toHaveBeenCalledWith(resolvedModel);
expect(modelAuthServiceMock.setSelectedModel).not.toHaveBeenCalled();
```

- [ ] **Step 3: Run tests to verify RED**

Run: `npx vitest --run tests/unit/model-auth-service.test.ts tests/integration/ipc-router.test.ts`

Expected: FAIL because the new operation/method is absent.

- [ ] **Step 4: Add model resolution for session switching**

Add a public method that refreshes/uses the registry, rejects missing models, verifies configured auth, and returns the SDK model without changing app settings:

```ts
async resolveConfiguredModel(ref: SelectedModelRef): Promise<Model<Api>> {
  const registry = await this.getModelRegistry();
  const model = registry.find(ref.provider, ref.modelId);
  if (!model) throw new Error(this.selectedModelMissingMessage(ref));
  if (!registry.getProviderAuthStatus(ref.provider).configured) {
    throw new Error(`Provider ${ref.provider} is not configured`);
  }
  return model;
}
```

Use actual SDK generic imports already present in the file.

- [ ] **Step 5: Add typed IPC and handler**

Add:

```ts
"session.setModel": {
  req: { piSessionId: string; model: SelectedModelRef };
  res: Record<string, never>;
};
```

Handler: find attached session, reject `session.isStreaming`, resolve configured model, await `session.setModel(model)`, map auth/model/not-found failures using existing envelope conventions, return `ok({})`.

- [ ] **Step 6: Add renderer mutation**

Create `useSetSessionModel` calling `session.setModel`; on success invalidate `["session.footerStats", piSessionId]`. Do not invalidate or mutate the saved selected-model setting.

- [ ] **Step 7: Verify and commit**

Run focused tests, typecheck, targeted Biome, and full tests.

```bash
git add src/shared/ipc-types.ts src/main/model-auth-service.ts src/main/ipc-router.ts src/renderer/queries.ts tests/unit/model-auth-service.test.ts tests/integration/ipc-router.test.ts
git commit -m "feat: switch models in the current session"
```

### Task 6: Searchable chat model menu

**Files:**
- Create: `src/renderer/components/ChatModelMenu.tsx`
- Modify: `src/renderer/components/ChatFooter.tsx`
- Modify: `src/renderer/components/ChatPane.tsx`
- Create: `tests/unit/chat-model-menu.test.ts`
- Modify/Create: `tests/unit/chat-footer.test.ts`

- [ ] **Step 1: Impact-analyze ChatFooter/ChatPane**

Run impact on `ChatFooter` and `ChatPane`; confirm changes affect only chat composition/footer flows and report risk.

- [ ] **Step 2: Write failing rendered tests**

Cover one popup, search, Favourites, provider-grouped All, duplicates across sections, configured-only filtering, current indicator, empty states, Escape/outside click, successful switch, error display, focus restoration, and disabled trigger while streaming/pending.

```ts
expect(section("Favourites")).toContain("Claude Sonnet");
expect(section("All")).toContain("Anthropic");
expect(setSessionModel).toHaveBeenCalledWith({
  piSessionId: "session-1",
  model: { provider: "anthropic", modelId: "claude-sonnet" },
});
```

- [ ] **Step 3: Run tests to verify RED**

Run: `npx vitest --run tests/unit/chat-model-menu.test.ts tests/unit/chat-footer.test.ts`

Expected: FAIL because the menu and clickable footer do not exist.

- [ ] **Step 4: Implement ChatModelMenu**

Use provider/model/settings queries, shared helpers, and `getFavouriteModels`. Render one anchored dialog/menu with labelled search and Favourites/All sections. Filter both sections by search, keep All grouped by provider, indicate active model, and call `useSetSessionModel`. Install document pointer/keydown listeners only while open and clean them up. Close on success; keep error visible on failure.

- [ ] **Step 5: Make ChatFooter model label interactive**

Replace the model span with a button exposing `aria-expanded`, `aria-haspopup`, and disabled state. Render `ChatModelMenu` anchored to the model item. Extend footer model stats if needed to include provider ID so the active model key is unambiguous.

- [ ] **Step 6: Pass streaming state from ChatPane**

Change `<ChatFooter piSessionId={piSessionId} />` to include `streaming={snapshot.streaming}`. Keep the main-process streaming guard as defense in depth.

- [ ] **Step 7: Verify complete feature**

Run:

```bash
npx vitest --run tests/unit/model-provider-view.test.ts tests/unit/providers-settings.test.ts tests/unit/models-settings.test.ts tests/unit/default-model-selector.test.ts tests/unit/chat-model-menu.test.ts tests/unit/chat-footer.test.ts tests/unit/model-auth-service.test.ts tests/integration/ipc-router.test.ts
npm run typecheck
npm run lint
npm test
```

If full lint encounters ignored harness artifacts, run targeted Biome on every changed source/test and report the unrelated files explicitly.

- [ ] **Step 8: Run change-impact review**

Run GitNexus `detect_changes({ scope: "compare", base_ref: "main" })`. Confirm affected flows are limited to Settings provider/model/default management, session model switching, and the chat footer. Review the complete diff and `git diff --check`.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/ChatModelMenu.tsx src/renderer/components/ChatFooter.tsx src/renderer/components/ChatPane.tsx tests/unit/chat-model-menu.test.ts tests/unit/chat-footer.test.ts
git commit -m "feat: choose the current chat model"
```

### Task 7: Final regression and documentation consistency

**Files:**
- Modify only if verification identifies a defect.

- [ ] **Step 1: Run full verification from a clean worktree**

Run `npm test`, `npm run typecheck`, and targeted/full lint. Confirm no uncommitted files.

- [ ] **Step 2: Manual acceptance pass**

Verify Providers compactness and Local dropdown, auth flows, Models favourites, Defaults model selection, chat menu sections/search, current-session switch, disabled streaming state, and persistence boundaries.

- [ ] **Step 3: Independent spec and quality reviews**

Review against `docs/superpowers/specs/2026-07-12-provider-model-selection-design.md`, then perform code-quality review. Fix and re-review every material issue.
