# Provider and Model Selection Design

## Goal

Separate provider authentication, model favourites, default-model selection, and current-chat model switching into clear, compact interfaces.

## Current problems

The current **Models & Auth** screen mixes provider authentication, local provider setup, model discovery, favourites, and active-model selection. Its filter row can overflow—the **Local** label overlaps the vertical divider—and the dense layout makes its primary purpose unclear. The chat footer displays the active model but cannot switch it.

## Information architecture

The Settings sidebar's **Workspace** group contains:

1. **Providers** — provider discovery, authentication, local endpoints, import, and advanced configuration.
2. **Models** — favourite-model management.
3. **Defaults** — default working directory, default model for new chats, environment information, and logs.

The former **Models & Auth** category and heading become **Providers**. Error actions that currently say “Open Models & Auth” become “Open Providers.”

## Providers screen

### Purpose

Providers configures authentication and local provider endpoints. It may expose discovered models for diagnostics, but it never favourites or selects a model.

### Layout

Use a compact two-column master-detail layout:

- The left column contains provider search, a filter dropdown, **Add local provider**, and compact provider rows.
- The filter dropdown contains **All**, **Configured**, **Cloud**, and **Local**. It replaces the horizontal filter tabs and prevents the Local-label divider overlap.
- The right column contains the selected provider's identity, configuration state, and authentication controls.
- Spacing, badges, provider rows, and column width are reduced from the current design without sacrificing readable targets.

The existing **Advanced**, **Import from pi**, OAuth, API-key, logout, local-provider discovery/editing, and error flows remain available.

### Read-only model inventory

Provider detail shows a collapsed disclosure labeled **N models available**. Expanding it reveals a compact read-only model list. It has no star buttons, selection state, or active-model controls. The current “Active” footer is removed.

## Models settings screen

### Purpose

Models manages the global `modelFavourites` setting only. It never changes the current session or saved default.

### Layout and behavior

- The left column lists only providers whose authentication status is configured, with model counts.
- Selecting a provider displays its models in the right column.
- The right side has model search by display name and model ID.
- Every model row has a visible star toggle and an accessible **Add to favourites** or **Remove from favourites** name.
- Favourite state persists through the existing settings mechanism and updates all consumers.
- If no providers are configured, explain that authentication must be configured under Providers.
- If the selected provider has no discovered models or search has no matches, show a specific empty state.

Favourites remain global, not workspace- or session-specific. Ordering and drag-and-drop are out of scope.

## Default model

### Defaults screen

Add **Default model for new chats** to Defaults. It uses a searchable selector grouped by configured provider and includes **Automatic fallback**.

- Selecting a model uses the existing `modelsAuth.setSelectedModel` operation.
- Selecting Automatic fallback clears the saved model.
- The control shows the current saved default and identifies an unavailable saved model without silently replacing it.
- Loading and save failures appear inline.
- Changing the default affects newly created sessions only; it does not change existing sessions.

A right-click action is intentionally avoided because default selection is important and must be discoverable.

## Current-chat model menu

### Entry point

The model label in `ChatFooter` becomes a keyboard-accessible button while remaining in its current footer position. Its visual treatment stays compact and consistent with the thinking and context indicators.

### Popup

Clicking the model button opens one popup containing:

1. A search field covering configured provider names, model names, and model IDs.
2. A **Favourites** section containing favourited models whose providers are currently configured.
3. An **All** section grouped under provider headings and containing every model from configured providers.

A favourite may appear in both sections. The active session model has a visible and accessible selected indicator. Empty favourites and no-search-results states are explicit.

Escape, outside click, or a successful model switch closes the popup. The trigger restores focus when appropriate.

### Availability

The menu is disabled while the session is streaming or a model switch is pending. It is unavailable when no session is attached. If no providers are configured, it explains the condition and directs the user to Providers.

## Session-scoped model switching

### IPC contract

Add a typed session operation accepting:

```ts
{
  piSessionId: string;
  model: { provider: string; modelId: string };
}
```

The operation returns an empty success result. It does not update `selectedModel` in application settings.

### Main-process flow

The IPC handler:

1. Retrieves the attached Pi `AgentSession`; missing sessions return `not_found`.
2. Rejects the request when the session is streaming.
3. Refreshes/uses the existing model registry to resolve the requested provider and model ID.
4. Rejects unknown models.
5. Confirms the provider's auth status is configured; unconfigured providers are rejected as authentication errors.
6. Calls Pi's documented `AgentSession.setModel(model)` API.
7. Maps errors through the existing IPC envelope conventions.

After success, the renderer invalidates session footer statistics so the displayed model updates. The current session's context history is retained; only subsequent turns use the new model.

The model selector must not call `modelsAuth.setSelectedModel`, ensuring current-session choice and new-session default remain independent.

## Shared view logic and component boundaries

Refactor rather than duplicate the existing large screen:

- `ProvidersSettings` owns provider management and read-only inventory.
- `ModelsSettings` owns configured-provider browsing and favourites.
- `DefaultModelSelector` owns saved-default selection and is composed into `DefaultsSettings`.
- `ChatModelMenu` owns footer popup search, grouping, selection, and dismissal.
- Shared pure utilities build provider views, filter configured providers/models, and group menu entries.
- Existing authentication forms and OAuth dialog remain reusable provider components.

The implementation may split `ModelsAuthSettings.tsx` into focused files. Unrelated Settings or chat refactors are out of scope.

## Accessibility

- All selectors and disclosures are operable with keyboard controls.
- Star toggles have explicit accessible labels and pressed state.
- The chat model trigger exposes expanded state and popup relationship.
- The active model uses text/icon semantics, not color alone.
- Search fields have labels or accessible names.
- Focus returns predictably after popup dismissal.
- Compact styling retains adequate hit targets and does not rely on hover-only controls.

## Error handling

- Provider/auth errors stay within Providers.
- Favourite-setting errors remain visible in Models without optimistically losing the prior state.
- Invalid or unavailable defaults remain visible in Defaults with recovery choices.
- Session-switch errors appear adjacent to the chat menu; the previous model remains active.
- Failed switches keep or reopen enough context for retry and never mutate the saved default.

## Testing

Automated tests cover:

1. Provider filtering through the dropdown and compact layout structure.
2. Providers retaining auth/local/import/advanced behavior while removing favourites and model selection.
3. Read-only model inventory disclosure.
4. Models listing only configured providers, model search, favourite toggling, and empty states.
5. Default selector grouping, selecting a configured model, clearing to Automatic fallback, unavailable defaults, and errors.
6. Chat popup search, Favourites and provider-grouped All sections, duplicate favourite visibility, current-model indication, and dismissal behavior.
7. Disabled chat selection during streaming or pending mutation.
8. IPC handling for missing session, streaming session, unknown model, unconfigured provider, successful `setModel`, and error mapping.
9. Footer-stat invalidation after success and proof that session switching does not mutate the saved default.
10. Regression coverage for OAuth, API-key, local-provider, import, and advanced configuration flows.

## Out of scope

- Model-registry or authentication-file format changes.
- Switching models during an active streamed response.
- Synchronizing current-session selection with the default.
- Favourite ordering or per-workspace/session favourites.
- Model comparison, pricing, benchmark, or capability-filter interfaces.
