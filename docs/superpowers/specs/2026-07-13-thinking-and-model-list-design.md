# Thinking Selector and Model List Refinement Design

## Goal

Make the chat thinking level directly selectable, organize model favourites into clear movable sections, and simplify default-model selection by removing a redundant search field.

## Chat thinking selector

### Interaction

The existing `think: <level>` footer text becomes a compact, keyboard-accessible button in the same position. Clicking opens a small anchored menu listing only thinking levels supported by the current session model.

The menu:

- Marks the current thinking level visibly and accessibly.
- Uses human-readable labels: Off, Minimal, Low, Medium, High, and XHigh.
- Disables its trigger and choices while the session is streaming or a change is pending.
- Closes on successful selection, Escape, or outside click.
- Restores focus to its trigger after dismissal.
- Keeps errors visible with enough context to retry.

If the current model exposes only `off`, the selector may still open and show that single selected option. Missing sessions do not render the footer.

### Scope and persistence

A selected thinking level affects both:

1. The current chat session immediately.
2. Pi's default thinking level for future chats.

This differs intentionally from current-chat model selection, which does not change the default model. Pi's documented `AgentSession.setThinkingLevel` already records the session change and persists the default when the level changes, so this behavior should not be undone or restored.

### IPC

Add a typed operation:

```ts
"session.setThinkingLevel": {
  req: { piSessionId: string; level: ThinkingLevel };
  res: Record<string, never>;
};
```

The main process:

1. Finds the attached session or returns `not_found`.
2. Rejects changes while the session is streaming.
3. Reads `session.getAvailableThinkingLevels()` and rejects unsupported input rather than relying on SDK clamping.
4. Rechecks streaming immediately before mutation.
5. Calls `session.setThinkingLevel(level)`.
6. Returns the effective current level through refreshed footer statistics.

Concurrent requests are prevented in the renderer while pending. Because `setThinkingLevel` is synchronous, the main-process validation and mutation have no asynchronous gap after the final streaming check.

After success, the renderer invalidates `session.footerStats` for the current session.

### Footer statistics

Extend footer statistics with `availableThinkingLevels: ThinkingLevel[]`, sourced from `session.getAvailableThinkingLevels()`. The menu consumes this authoritative session-specific list instead of inferring capabilities from model registry data.

## Models favourites sections

The Models screen retains configured-provider navigation and model search. The selected provider's filtered models are divided into two independent disclosure sections:

1. **Favourites (N)** — models currently favourited for that provider.
2. **All models (N)** — models not currently favourited for that provider.

Both sections start expanded. Each heading is a real button or disclosure control with `aria-expanded` and a clear relationship to its content.

When a model is favourited or unfavourited, its row immediately moves to the other section using the existing optimistic draft. The existing serialized write queue, rollback on latest failure, StrictMode safety, and visible mutation error behavior remain unchanged.

Search applies to both sections. Counts reflect the current filtered result in each section. Empty states distinguish:

- No favourites for this provider/search.
- No remaining non-favourite models.
- No models matching the search at all.

The **All models** section excludes favourites, preventing duplicate rows on this Settings screen. This does not change the chat model menu, where favourites intentionally also appear under All.

## Default model simplification

Remove the separate **Search configured models** input and all associated search/filter state from `DefaultModelSelector`.

Keep:

- The **Default model for new chats** heading and explanation.
- Current saved default display.
- **Choose default model** grouped selector.
- **Automatic fallback**.
- Configured-provider-only options.
- Unavailable saved-default recovery.
- Loading, query, registry, pending, and save-error states.

All configured model options remain visible in the grouped selector. No replacement search UI is added.

## Component boundaries

- Create `ChatThinkingMenu` for footer menu state, dismissal, and selection.
- Compose it into `ChatFooter` beside `ChatModelMenu`.
- Add `useSetSessionThinkingLevel` to renderer queries.
- Extend typed IPC and the existing session handler surface.
- Refactor only the model-list rendering portion of `ModelsSettings`; retain its persistence queue unchanged.
- Simplify `DefaultModelSelector` by deleting search state and filtered-group logic.

## Error handling and accessibility

- Thinking-level errors appear inside the open menu and do not change the displayed current level.
- Unsupported thinking levels return a structured validation error.
- Streaming changes return a busy/conflict error.
- Thinking trigger and disclosure controls expose expanded state and remain keyboard-operable.
- Current selections use text/icon semantics rather than color alone.
- Collapsible model sections preserve native focus behavior and adequate hit targets.

## Testing

Automated tests cover:

1. Footer statistics returning available thinking levels.
2. Thinking IPC: missing session, streaming, unsupported level, success, and final streaming guard.
3. Successful thinking selection payload, footer invalidation, current/default SDK behavior, failure retry context, Escape/outside dismissal, focus restoration, and streaming/pending disablement.
4. Only model-supported thinking levels are displayed and the current one is marked.
5. Models favourites and non-favourites render in separate expanded sections.
6. Toggling moves rows between sections while preserving persistence queue and rollback behavior.
7. Search filters both sections and counts/empty states remain correct.
8. Collapsible controls and accessible expanded state.
9. Defaults no longer renders search, while grouped set/clear/unavailable/error behavior remains intact.
10. Full regression tests for the existing model menu, Providers, Models persistence, Defaults, and session model switching.

## Out of scope

- Per-model saved thinking defaults.
- A separate thinking default control in Settings.
- Changing thinking while a response is streaming.
- Reordering favourites.
- Changing the chat model menu's intentional Favourites/All duplication.
