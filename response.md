# Macpi auth/model setup suggestions

Okay, shape is good. Current macpi is doing the obvious-but-leaky thing:

- `PiSessionManager.ensureContext()` uses `AuthStorage.create()` → default `~/.pi/agent/auth.json`
- `ModelRegistry.create(auth)` → default `~/.pi/agent/models.json`
- session creation passes those into `createAgentSession()`
- existing spec explicitly says credentials live in installed pi’s auth file

That made sense for foundation. Now it smells expensive because macpi can’t be self-contained.

## My recommendation

Use **macpi-owned auth + models**, not installed-pi auth.

Something like:

- `~/.macpi/auth.json`
- `~/.macpi/models.json`

`~/.macpi` already exists conceptually as the app resource root, so this fits the isolation model.

Pi already supports this cleanly:

- `AuthStorage.create("/path/to/auth.json")`
- `ModelRegistry.create(authStorage, "/path/to/models.json")`
- `authStorage.login(providerId, callbacks)` for OAuth
- `authStorage.set(provider, { type: "api_key", key })` for API keys
- `modelRegistry.getAll()`, `getAvailable()`, `getProviderAuthStatus()`

So we do not need to invent auth plumbing. We just need to stop using the default paths.

## UX I’d aim for

Settings → **Models & Auth**

### 1. Provider list

Show providers grouped by auth style:

- **Subscription sign-in**
  - ChatGPT / Codex — provider id appears to be `openai-codex`
  - Claude Pro/Max
  - GitHub Copilot
- **API key providers**
  - Anthropic
  - OpenAI
  - Google
  - OpenRouter
  - etc.
- **Custom / local providers**
  - from macpi `models.json`

Each provider row shows:

- display name
- auth status: signed in / API key saved / env var / models.json key / missing
- available model count
- actions: Sign in, Add key, Remove credentials, Edit models

### 2. Codex OAuth sign-in

Do **not** shell out to `pi auth login`.

Use pi’s SDK:

- call `authStorage.login("openai-codex", callbacks)`
- `onAuth` → open browser via Electron
- `onPrompt` / manual redirect → show in-app prompt
- `onDeviceCode` if provider uses it → show copyable code
- after success: `modelRegistry.refresh()`

The installed pi TUI already does this in `InteractiveMode.showLoginDialog()`. Macpi can mirror that behavior with Electron UI instead of terminal components.

Tiny goblin warning: OAuth callbacks have more shape than the docs headline shows — progress, select, manual callback input, abort signal. Worth matching the interactive implementation, not just the minimal docs.

### 3. Model picker

After provider auth, show models from `modelRegistry.getAll()` grouped by provider.

For each model show:

- model name/id
- provider
- whether auth is currently configured
- context window / max tokens if available
- reasoning/thinking support from `reasoning` + `thinkingLevelMap`

Selection should store:

```ts
{
  provider: "openai-codex",
  modelId: "gpt-5.5"
}
```

Then session creation resolves it with `modelRegistry.find(provider, modelId)` and passes the actual model into `createAgentSession({ model })`.

Right now macpi has the `SettingsValues.model` type but doesn’t actually wire it into session creation except test overrides. That’s the missing bridge.

## App-defined models

Use macpi’s own `models.json`.

This gives users/app config the same power as pi:

- custom OpenAI-compatible endpoints
- Ollama / LM Studio / vLLM
- proxy base URLs
- provider headers
- model overrides
- thinking level maps

I’d make the UI progressive:

### Simple mode

“Add custom provider”

Fields:

- Provider ID
- Display name
- API type: OpenAI Chat, OpenAI Responses, Anthropic, Google
- Base URL
- API key source:
  - store key in macpi auth
  - environment variable
  - shell command / password manager reference
- Models list

### Advanced mode

Raw `models.json` editor with validation.

That avoids building a config hydra too early.

## Storage/security choice

Two viable options:

### Option A — macpi-owned `auth.json`

Recommended first.

Pros:

- supported directly by pi
- minimal risk
- same file permissions behavior as pi
- easy import/export/debug

Cons:

- secrets live in a JSON file

### Option B — macOS Keychain-backed `AuthStorageBackend`

Fancy gremlin option.

Pi exposes `AuthStorage.fromStorage(...)`, so macpi could implement a backend that stores credentials in Keychain instead of JSON.

Pros:

- better native app security story
- app feels more Mac-like

Cons:

- more code
- file-lock semantics need careful imitation
- OAuth refresh writes need to be reliable
- higher chance of weird edge bugs

I’d start with A, design the service boundary so B can replace it later.

## Import path

First-run affordance:

> “Import auth/models from installed pi?”

Options:

- copy `~/.pi/agent/auth.json` → `~/.macpi/auth.json`
- copy `~/.pi/agent/models.json` → `~/.macpi/models.json`
- or skip

Important: copy, don’t symlink. Macpi should not mutate installed pi’s auth behind its back.

## Concrete architecture

Add a main-process `ProviderAuthService` / `ModelService` boundary:

- owns paths
- constructs `AuthStorage`
- constructs `ModelRegistry`
- exposes safe IPC:
  - list providers
  - list models
  - get auth status
  - save API key
  - start OAuth login
  - logout provider
  - write/read custom models config
  - refresh registry

Then `PiSessionManager` receives that shared auth/registry instead of constructing default ones internally.

That keeps auth out of renderer, keeps secrets in main, and avoids every component poking pi internals directly.

## One thing I would not do

Nope: don’t continue delegating sign-in to installed pi CLI. That keeps macpi as a skin over someone else’s state. Future-you tax. Bad smell.

The better direction is:

> macpi uses pi SDK behavior, but owns its own auth/model state.

That gives you provider selection, model selection, Codex OAuth, import from pi, custom models, and eventually Keychain — without forking pi’s provider system.
