# macpi Auth & Model Design — Option A: macpi-owned `auth.json`

## 1. Goal

Move macpi from using the installed pi agent’s auth/model files to owning its own auth and model configuration inside the application data boundary.

Today `PiSessionManager` constructs:

```ts
AuthStorage.create();
ModelRegistry.create(authStorage);
```

Those default to:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/models.json`

That makes macpi depend on external pi CLI state and prevents users from configuring providers and models inside the app.

Option A keeps pi’s existing auth/model machinery, but points it at macpi-owned files:

- `~/.macpi/auth.json`
- `~/.macpi/models.json`

This is the smallest safe architecture that gives macpi first-class provider selection, model selection, Codex OAuth, API-key login, custom models, and future import/export.

## 2. Non-goals

This design does **not** include:

- macOS Keychain storage.
- Reimplementing pi provider auth flows.
- Shelling out to `pi auth login`.
- Storing secrets in the renderer.
- Sharing live auth state with installed pi.
- A full visual UI spec for every settings screen.
- Custom OAuth provider authoring beyond what pi already supports through `models.json` / extensions.

Keychain can be added later by replacing the storage backend with `AuthStorage.fromStorage(...)` behind the same service boundary.

## 3. Design summary

Create a main-process service, tentatively `ModelAuthService`, that owns:

- macpi auth path
- macpi models path
- `AuthStorage`
- `ModelRegistry`
- provider/model listing
- API key save/remove
- OAuth login/logout
- `models.json` read/write/validation

`PiSessionManager` should stop constructing default auth/model instances directly. Instead, it receives or resolves the shared macpi-owned auth/model dependencies.

Renderer talks to this through IPC only. Secrets never cross IPC except when the user submits a new API key to save.

## 4. File locations

Default paths:

```txt
~/.macpi/auth.json
~/.macpi/models.json
```

These should use the same root concept as existing macpi resources. If the app already allows configuring `resourceRoot`, the auth/model paths should either:

1. live under that configured root, or
2. live under a fixed app state root.

Recommendation: use the configured macpi resource root, defaulting to `~/.macpi`, but treat auth/model files as app-owned state, not editable skills/extensions/prompts resources.

Resolved paths:

```txt
<macpiRoot>/auth.json
<macpiRoot>/models.json
```

Initial default:

```txt
~/.macpi/auth.json
~/.macpi/models.json
```

## 5. Data ownership

### 5.1 macpi owns

- Provider credentials saved through the app.
- OAuth tokens acquired through the app.
- Custom model/provider definitions created or edited through the app.
- Selected model references in macpi settings.

### 5.2 pi SDK owns

- Credential file format.
- OAuth token refresh behavior.
- Provider registry behavior.
- Model resolution.
- Auth priority rules.
- Request auth headers.

### 5.3 renderer owns

- Display state.
- Form state.
- User interactions.

The renderer must not read `auth.json` directly.

## 6. Core service

### 6.1 Service name

Recommended name:

```ts
ModelAuthService
```

Alternative acceptable names:

- `ProviderAuthService`
- `ModelsService`
- `PiAuthService`

`ModelAuthService` is best because auth and model registry are coupled in pi: model availability depends on auth status.

### 6.2 Responsibilities

The service should:

- Resolve macpi auth/model paths.
- Ensure parent directory exists.
- Construct `AuthStorage.create(authPath)`.
- Construct `ModelRegistry.create(authStorage, modelsPath)`.
- Expose the shared `AuthStorage` and `ModelRegistry` to `PiSessionManager`.
- List providers known through OAuth providers and model registry.
- List all models.
- List auth-available models.
- Report provider auth status without exposing secrets.
- Save API-key credentials.
- Remove credentials.
- Start OAuth login flows.
- Refresh the registry after auth/model changes.
- Read/write `models.json` for the settings UI.
- Surface validation/load errors from `ModelRegistry.getError()`.

### 6.3 Lifetime

Create one service instance during main process startup.

It should be long-lived and shared by:

- `PiSessionManager`
- IPC router
- settings UI handlers
- import flow handlers

Avoid creating separate `AuthStorage` / `ModelRegistry` instances per request unless there is a deliberate refresh boundary. Multiple instances are a footgun for stale auth/model state.

## 7. Integration with `PiSessionManager`

Current production path:

```ts
private async ensureContext(): Promise<PiContext> {
  if (this.ctx) return this.ctx;
  const mod = await loadPi();
  const auth = mod.AuthStorage.create();
  const registry = mod.ModelRegistry.create(auth);
  this.ctx = { mod, auth, registry };
  return this.ctx;
}
```

Target shape:

```ts
private async ensureContext(): Promise<PiContext> {
  if (this.ctx) return this.ctx;
  const mod = await loadPi();
  const auth = this.deps.modelAuth.authStorage;
  const registry = this.deps.modelAuth.modelRegistry;
  this.ctx = { mod, auth, registry };
  return this.ctx;
}
```

The exact dependency shape can vary, but the important rule is:

> `PiSessionManager` must use macpi-owned `AuthStorage` and `ModelRegistry`, not default pi paths.

### 7.1 Session creation

When creating or attaching sessions, resolve the selected model from macpi settings:

```ts
const modelRef = effectiveSettings.model;
const model = modelRef
  ? registry.find(modelRef.provider, modelRef.modelId)
  : undefined;
```

Then pass it to pi:

```ts
createAgentSession({
  cwd,
  authStorage,
  modelRegistry,
  model,
  thinkingLevel,
  resourceLoader,
  settingsManager,
});
```

If no model is selected, pi can keep its default fallback behavior, but the UI should strongly encourage selecting a model.

### 7.2 Missing model behavior

If settings reference a model that no longer exists:

- Do not silently select a random model.
- Surface a `model` error.
- Show a renderer action: **Open Models & Auth**.
- Let user choose a replacement.

### 7.3 Missing auth behavior

If selected model has no configured auth:

- Surface an `auth` error.
- Show actions:
  - **Sign in / Add key** for that provider.
  - **Choose another model**.

## 8. IPC API

Add model/auth IPC methods. Names are illustrative.

### 8.1 `modelsAuth.listProviders`

Returns provider-level data safe for renderer display.

Response shape:

```ts
type ProviderSummary = {
  id: string;
  name: string;
  authType: "oauth" | "api_key" | "custom" | "cloud" | "unknown";
  authStatus: {
    configured: boolean;
    source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command";
    label?: string;
  };
  modelCount: number;
  availableModelCount: number;
  supportsOAuth: boolean;
  supportsStoredApiKey: boolean;
};
```

Provider sources:

- OAuth providers from `authStorage.getOAuthProviders()`.
- Model providers from `modelRegistry.getAll()`.
- Stored credentials from `authStorage.list()`.

### 8.2 `modelsAuth.listModels`

Returns model data for picker UI.

```ts
type ModelSummary = {
  provider: string;
  providerName: string;
  id: string;
  name: string;
  authConfigured: boolean;
  usingOAuth: boolean;
  reasoning: boolean;
  thinkingLevels: string[];
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
};
```

This should be derived from `modelRegistry.getAll()` plus:

- `modelRegistry.hasConfiguredAuth(model)`
- `modelRegistry.isUsingOAuth(model)`
- `modelRegistry.getProviderDisplayName(provider)`

### 8.3 `modelsAuth.getSelectedModel`

Returns current global/channel/session selected model depending on scope.

This may reuse existing settings cascade infrastructure.

### 8.4 `modelsAuth.setSelectedModel`

Request:

```ts
{
  scope: "global" | "channel" | "session";
  scopeId?: string;
  model: { provider: string; modelId: string } | null;
}
```

Rules:

- Validate that model exists with `modelRegistry.find(...)`.
- Store only `{ provider, modelId }`.
- Do not store the full model object.

### 8.5 `modelsAuth.saveApiKey`

Request:

```ts
{
  provider: string;
  apiKey: string;
}
```

Main process behavior:

```ts
authStorage.set(provider, { type: "api_key", key: apiKey });
modelRegistry.refresh();
```

Response should not include the key.

### 8.6 `modelsAuth.logoutProvider`

Request:

```ts
{
  provider: string;
}
```

Main process behavior:

```ts
authStorage.logout(provider);
modelRegistry.refresh();
```

This removes stored credentials only. It cannot remove environment variables or `models.json` command/key fallback config.

### 8.7 `modelsAuth.startOAuthLogin`

Request:

```ts
{
  provider: string;
}
```

Main process calls:

```ts
authStorage.login(provider, callbacks);
```

OAuth is interactive, so this needs an IPC event channel or request/session ID.

Recommended flow:

1. Renderer calls `startOAuthLogin(provider)`.
2. Main returns `{ loginId }`.
3. Main emits login events:
   - `oauth.authUrl`
   - `oauth.deviceCode`
   - `oauth.prompt`
   - `oauth.progress`
   - `oauth.select`
   - `oauth.success`
   - `oauth.error`
4. Renderer responds to prompts/selects with IPC calls keyed by `loginId`.

This avoids blocking one IPC request forever while waiting for user input.

## 9. OAuth flow design

Pi’s OAuth callback API includes more than just browser URL handling. Macpi should mirror the interactive implementation closely.

Known callback concepts from pi interactive mode:

- `onAuth(info)` — show/open auth URL.
- `onPrompt(prompt)` — ask user for code/input.
- `onProgress(message)` — show status.
- `onSelect(prompt)` — user chooses from options.
- `onManualCodeInput()` — for callback-server flows where user may paste redirect URL.
- `signal` — cancellation.

### 9.1 Browser auth

When main receives `onAuth({ url, instructions })`:

- emit auth URL to renderer
- renderer shows instructions
- renderer offers **Open Browser**
- main or renderer uses Electron shell to open URL

Opening the browser from main is slightly cleaner because Electron shell is main-safe and keeps renderer sandboxing tighter.

### 9.2 Prompt input

When pi calls `onPrompt({ message, placeholder })`:

- main emits prompt event with `loginId`
- renderer shows modal input
- renderer sends response back
- main resolves the waiting promise

### 9.3 Device code

If a provider uses device code:

- show code prominently
- copy button
- open verification URL button
- show waiting/progress state

### 9.4 Manual callback input

For providers that use callback-server flows:

- show “Paste redirect URL here if browser login does not finish automatically.”
- race manual input with callback completion, matching pi interactive behavior.

### 9.5 Cancellation

Every OAuth modal needs Cancel.

Cancel should:

- abort the callback signal if supported
- reject pending prompts with a cancel error
- clear any login session state in main
- leave existing credentials unchanged

### 9.6 Completion

On successful login:

```ts
modelRegistry.refresh();
```

Then emit updated provider/model summaries.

If no model is selected yet, the UI should offer:

- select provider’s default model if available
- or open model picker filtered to that provider

Do not silently select a model if it would surprise the user. A post-login “Use gpt-5.5?” confirmation is friendlier.

## 10. Settings UI

Add a new settings category:

```txt
Models & Auth
```

### 10.1 Sections

Recommended layout:

1. **Selected model**
   - current model
   - provider
   - auth status
   - change button

2. **Providers**
   - grouped provider list
   - sign in / add key / remove credentials

3. **Custom models**
   - simple provider editor
   - advanced raw `models.json` editor

4. **Import**
   - import from installed pi

### 10.2 Provider row actions

For OAuth providers:

- Sign in
- Sign out
- Refresh status

For API-key providers:

- Add / replace key
- Remove stored key

For cloud providers like Bedrock/Vertex:

- Show setup instructions
- Do not pretend macpi can store all required auth as one API key if pi relies on environment/AWS/GCloud config.

### 10.3 Model picker

Model picker behavior:

- Group by provider.
- Search by provider, model id, display name.
- Filter:
  - all models
  - authenticated only
  - reasoning-capable
  - image-capable
- Clearly mark unauthenticated models.

Selecting an unauthenticated model is allowed only if the UI immediately guides the user to auth setup. Better default: disable unauthenticated rows with an action button.

## 11. Custom `models.json`

### 11.1 Raw editor

The advanced editor reads/writes macpi’s `models.json`.

Flow:

1. Renderer requests current text.
2. User edits.
3. Renderer submits text.
4. Main validates JSON parse.
5. Main writes file.
6. Main calls `modelRegistry.refresh()`.
7. Main checks `modelRegistry.getError()`.
8. If error, show it and keep editor open.

### 11.2 Simple editor

The simple editor can generate config for common cases:

- OpenAI-compatible local server
- OpenAI Responses-compatible proxy
- Anthropic-compatible proxy
- Google Generative AI-compatible endpoint

Fields:

- provider id
- display name
- base URL
- API type
- API key source
- auth header enabled
- model list
- reasoning support
- context window
- max tokens

This can land after the raw editor. Raw editor first is acceptable.

## 12. Import from installed pi

First-run or settings action:

```txt
Import from installed pi
```

Source paths:

```txt
~/.pi/agent/auth.json
~/.pi/agent/models.json
```

Destination paths:

```txt
~/.macpi/auth.json
~/.macpi/models.json
```

### 12.1 Import behavior

Offer choices:

- Import auth only
- Import models only
- Import both
- Skip

Default recommendation: import both if present.

### 12.2 Conflict behavior

If destination file does not exist:

- copy source to destination

If destination exists:

- ask user:
  - replace macpi file
  - merge where safe
  - cancel

For v1, prefer replace/cancel over clever merging. Auth merging can accidentally preserve old credentials or overwrite fresh OAuth tokens. Raccoon with a soldering iron territory.

### 12.3 Security

After copying `auth.json`, ensure file permissions are user read/write only if possible. Pi’s `FileAuthStorageBackend` creates files with safe permissions; copied files should not weaken that.

## 13. Error handling

### 13.1 Auth file errors

If `auth.json` cannot be read or parsed:

- service should expose a clear error state
- settings UI should show:
  - file path
  - error message
  - actions: reveal in Finder, reset file, retry

Do not silently delete credentials.

### 13.2 Models file errors

If `models.json` has validation/load errors:

- `modelRegistry.getError()` should surface it
- built-in models may still be available
- UI should show warning banner in Models & Auth

### 13.3 OAuth errors

Show provider-specific failure message.

Common actions:

- retry
- cancel
- open logs

### 13.4 Session auth/model errors

Existing `session.error` can continue using codes:

- `auth`
- `model`
- `transient`
- `unknown`

Improve auth/model banners:

- `auth`: **Open Models & Auth**
- `model`: **Choose model**

## 14. Security model

### 14.1 Secrets stay in main

Renderer can submit a secret but never reads it back.

Allowed renderer-visible auth data:

- configured true/false
- source label
- provider name
- credential type

Forbidden renderer-visible data:

- API key value
- OAuth access token
- OAuth refresh token

### 14.2 IPC hardening

- Validate provider id strings.
- Validate selected model exists.
- Validate JSON before writing `models.json`.
- Do not expose arbitrary file read/write through model editor endpoints.
- Do not allow renderer to request raw `auth.json`.

### 14.3 Logs

Do not log API keys or OAuth tokens.

When logging auth events, log provider id and status only.

## 15. Migration strategy

### Phase 1 — service boundary

- Add `ModelAuthService` with macpi-owned paths.
- Wire `PiSessionManager` to use it.
- Preserve existing behavior as much as possible.
- If no macpi credentials exist, sessions may fail auth until user imports/signs in.

### Phase 2 — import affordance

- Add settings action to import installed pi auth/models.
- Optionally show first-run prompt if source files exist and destination files do not.

### Phase 3 — provider/model listing

- Add IPC to list providers and models.
- Add read-only Settings UI for visibility.

### Phase 4 — API key auth

- Add save/remove API key UI.
- Refresh registry after changes.

### Phase 5 — OAuth auth

- Add interactive OAuth flow.
- Prioritize Codex / `openai-codex`.

### Phase 6 — selected model wiring

- Add model picker.
- Persist `{ provider, modelId }`.
- Resolve and pass selected model to session creation.

### Phase 7 — custom models

- Add raw `models.json` editor.
- Later add simple editor.

## 16. Testing strategy

### 16.1 Unit tests

Test service behavior with temp dirs:

- creates custom auth/model paths
- does not use `~/.pi/agent`
- saves API key without exposing value
- removes stored credentials
- lists providers/models
- handles malformed `models.json`

### 16.2 Integration tests

Use existing faux provider harness patterns:

- create temp auth path
- create temp models path
- inject dummy auth
- verify `PiSessionManager` uses provided registry
- verify selected model is passed to `createAgentSession`

### 16.3 Manual smoke tests

- Fresh app with no credentials shows Models & Auth guidance.
- Import from installed pi works.
- Add Anthropic/OpenAI API key and model becomes available.
- Codex OAuth login succeeds.
- Select Codex model and start session.
- Remove credentials and verify session surfaces auth error.
- Invalid `models.json` shows error without crashing.

## 17. Open questions

1. Should auth/model files live under configurable `resourceRoot`, or a fixed Electron app data path?

   Recommendation: configurable `resourceRoot` defaulting to `~/.macpi`, because existing macpi resource isolation already points there.

2. Should first-run import be automatic?

   Recommendation: no. Prompt the user. Copying credentials should be explicit.

3. Should selecting an unauthenticated model be allowed?

   Recommendation: not by default. Let advanced users bypass later if needed.

4. Should raw `auth.json` editing be exposed?

   Recommendation: no. Offer API-key and logout operations only.

5. Should raw `models.json` editing ship before simple custom-provider forms?

   Recommendation: yes. It is faster, matches pi docs, and avoids overbuilding a config UI before actual usage teaches us what forms matter.

## 18. Final recommendation

Proceed with Option A.

It keeps macpi aligned with pi’s SDK instead of forking auth/provider logic, while making macpi independent from installed pi CLI state.

The key architectural move is small but important:

> One main-process `ModelAuthService` owns macpi `AuthStorage` + `ModelRegistry`, and every session uses those shared instances.

Everything else — provider list, Codex OAuth, API keys, model picker, imports, custom models — becomes UI and IPC around that stable core.
