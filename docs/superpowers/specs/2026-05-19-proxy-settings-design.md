# Proxy Settings Design

## Summary

Add global HTTP/HTTPS proxy configuration to macpi. Users configure optional HTTP proxy, HTTPS proxy, and `NO_PROXY` bypass list from the global Settings dialog. Configured values apply to newly-created Pi work and package/resource operations; already-running sessions are not mutated.

## Goals

- Add a new **Proxy** category to the global Settings dialog.
- Let users configure:
  - HTTP proxy: optional full `http://` or `https://` URL, no auth.
  - HTTPS proxy: optional full `http://` or `https://` URL, no auth.
  - No proxy: optional comma-separated `NO_PROXY` list.
- Reject invalid proxy URLs in the UI before saving.
- Apply configured proxy values to new Pi sessions and relevant one-shot Pi operations.
- Preserve ambient environment proxy values when macpi settings are empty.

## Non-goals

- Per-channel or per-session proxy overrides.
- Username/password proxy authentication.
- Live mutation of existing active sessions.
- Full semantic parsing of every possible `NO_PROXY` entry.
- End-to-end external network proxy testing in automated tests.

## Settings model

Add these global app settings to `APP_SETTINGS_DEFAULTS` in `src/shared/app-settings-keys.ts`:

- `httpProxy: ""`
- `httpsProxy: ""`
- `noProxy: ""`

Empty string means macpi has no override for that variable. It must not scrub inherited environment variables.

Add shared accessors:

- `getHttpProxy(settings): string`
- `getHttpsProxy(settings): string`
- `getNoProxy(settings): string`

Add shared validation/helpers:

- `validateProxyUrl(value): { ok: true } | { ok: false; message: string }`
  - Empty is valid.
  - Non-empty must parse as a URL.
  - Protocol must be `http:` or `https:`.
  - Username/password must be empty.
- `buildProxyEnv(settings): Record<string, string>`
  - Emits only non-empty configured values.
  - Emits upper and lower case variants for compatibility:
    - `HTTP_PROXY`, `http_proxy`
    - `HTTPS_PROXY`, `https_proxy`
    - `NO_PROXY`, `no_proxy`

`NO_PROXY` validation should stay permissive. Trim whitespace and reject newline/control-character style input if needed, but do not try to validate every domain/IP/wildcard form.

## Settings UI

Add a new `ProxySettings` renderer component and register it as a global Settings category.

Recommended placement:

- Group: **Workspace**
- Category: **Proxy**

Fields:

1. **HTTP proxy**
   - Placeholder: `http://proxy.example.com:8080`
   - Helper: “Used for HTTP requests. Leave empty to use the existing environment.”
2. **HTTPS proxy**
   - Placeholder: `http://proxy.example.com:8080`
   - Helper: “Used for HTTPS requests. Both http:// and https:// proxy URLs are accepted.”
3. **No proxy**
   - Placeholder: `localhost,127.0.0.1,.company.internal`
   - Helper: “Comma-separated hosts/domains that should bypass the proxy.”

Use local draft state plus a **Save** button. Invalid proxy URLs disable save and show inline errors. On save, persist the three settings through existing `settings.set` IPC and invalidate settings queries.

## Runtime application

Proxy settings apply to new work only:

- New Pi sessions.
- Re-attached/reloaded sessions, because those construct fresh `AgentSession` instances.
- One-shot package/resource operations where network access may happen, such as package manager operations.
- Future subprocesses spawned directly by macpi should receive the proxy env in their spawn env.

Because Pi currently runs in-process in macpi, use a tightly scoped environment helper around Pi operations that need proxy settings:

```ts
await withProxyEnv(settings, async () => {
  // create AgentSession, create/load package manager operation, etc.
});
```

`withProxyEnv` should:

1. Build configured proxy env overrides with `buildProxyEnv(settings)`.
2. Temporarily set only those configured variables on `process.env`.
3. Run the callback.
4. Restore the prior values for touched keys, deleting only keys that were previously absent.

This preserves ambient proxy variables when macpi settings are empty and avoids changing the process environment permanently. Existing active sessions are not changed.

## Error handling

- UI rejects invalid proxy URL fields before save.
- Runtime helper should not validate again beyond using the shared accessor/env builder; settings should already be valid, but malformed persisted legacy values should simply be ignored or omitted if helper validation is reused.
- If a network operation fails despite proxy settings, existing error reporting remains responsible for surfacing the failure.

## Tests

Unit tests:

- `validateProxyUrl` accepts:
  - `http://proxy.example.com:8080`
  - `https://proxy.example.com:8443`
- `validateProxyUrl` rejects:
  - `proxy.example.com:8080`
  - `socks5://proxy.example.com:1080`
  - `http://user:pass@proxy.example.com:8080`
- `buildProxyEnv`:
  - emits only non-empty configured settings
  - emits upper and lower case variants
  - does not include blank proxy settings

Renderer tests if current component test patterns support them:

- Proxy panel shows inline errors for invalid URLs.
- Invalid values prevent save.
- Valid values call `settings.set` for the three keys.

Main/integration tests:

- Creating/attaching/reloading a session applies configured proxy env during fresh Pi session construction.
- Empty macpi proxy settings do not delete or override ambient proxy env values.
- Package-manager operations run with configured proxy env when settings are present.

Manual smoke:

- Configure a local or corporate proxy.
- Start a fresh session.
- Confirm outbound requests route through the proxy.
- Change proxy settings and confirm existing active sessions are unaffected while new sessions use the new values.
