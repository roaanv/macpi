# OAuth Login Result Design

## Goal

Make OAuth completion unmistakable. After the OAuth provider finishes, the dialog must clearly distinguish a saved token from a failed login instead of relying on raw event names such as `oauth.success` or `oauth.error`.

## Existing flow

`ModelAuthService.startOAuthLogin` emits `oauth.success` only after `auth.login` resolves and auth storage and the model registry have refreshed. It emits `oauth.error` when login fails. `OAuthLoginDialog` already receives both terminal events, so this feature does not require a new IPC event or token inspection in the renderer.

## Result states

### Success

When the current login emits `oauth.success`:

- Replace the authorization URL and interactive prompt controls with a prominent success card.
- Show a green checkmark, “Login successful,” and “Your OAuth token was saved.”
- Keep the dialog open.
- Show a primary **Done** button in the modal footer. It closes the dialog.

### Failure

When the current login emits `oauth.error` or the initial start mutation fails:

- Replace the authorization controls with a prominent error card.
- Show a red cross, “Login failed,” and the actual error message.
- Show **Close** and primary **Try again** actions in the modal footer.
- **Try again** resets transient dialog state and starts a fresh OAuth login for the same provider.

Cancellation is not presented as a failure because closing or cancelling already dismisses the dialog.

## Layout and visual behavior

The result card occupies the main content area beneath the existing “OAuth login” heading and provider label. It uses the application’s semantic success/error colors and themeable surface and border tokens. The footer stays at the bottom of the modal, visually separate from the result card.

The raw event history remains available through a collapsed **Authentication details** disclosure. It is collapsed by default so diagnostic text does not compete with the terminal result. While login is active, the existing URL, prompts, progress history, Cancel action, and external-browser behavior remain unchanged.

Text and icons communicate status together; color is supplementary. The status card should use an accessible live-status semantic so completion is announced to assistive technology.

## State and retry behavior

The dialog derives its terminal state from the latest terminal OAuth event for its current `loginId`, not merely any historical event. Starting or retrying a login clears the prior ID, events, prompt input, and disclosed-details state before invoking the start mutation. Events from another login ID remain ignored.

While a retry start request is pending, controls must not permit duplicate retries. If that start request itself fails, the failure card displays the mutation error and keeps **Try again** available.

## Components and scope

The implementation is localized to `OAuthLoginDialog` and its tests. Existing `OAuthEvent` types, IPC routing, and `ModelAuthService` success/error semantics remain unchanged. No token value is exposed to the renderer.

Small internal helpers may derive terminal presentation state or render the status card, but unrelated authentication UI and service refactoring are out of scope.

## Testing

Component tests should cover:

1. Active login retains the existing browser URL and Cancel behavior.
2. `oauth.success` renders the green success result and bottom **Done** action.
3. `oauth.error` renders the red failure result, actual error, **Close**, and **Try again**.
4. A rejected start mutation renders the same retryable failure presentation.
5. **Try again** clears stale state and starts a new login for the same provider exactly once.
6. Authentication details are collapsed by default and can be expanded.
7. Events for a different provider or login do not replace the current result.
8. Status semantics and visible icon/text labels remain accessible.
