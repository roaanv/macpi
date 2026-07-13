# Custom Providers, Keychain Credentials, and Model Management Design

## Goal

Rename local providers to custom providers throughout MacPi, secure all API keys in macOS Keychain, allow model-less custom provider setup, manage custom model IDs from Models, and replace the default-model native select with a searchable popup.

## Terminology and identity migration

“Local provider” becomes “Custom provider” in UI, types, validation, and persisted IDs. New custom provider IDs must start with `custom-`.

An idempotent startup migration renames existing `local-*` providers to the corresponding `custom-*` ID across:

- Provider keys and model provider references in `models.json`.
- Stored credential and Keychain-reference provider keys.
- Global model favourites.
- Saved default-model references.

### ID collisions

If both `local-foo` and `custom-foo` exist:

- Keep the `custom-foo` provider's display name, endpoint, API type, headers, and authentication metadata.
- Merge models by model ID.
- Prefer the custom model entry for duplicate IDs.
- Preserve local-only models by appending them.
- Prefer the custom provider's credential reference. If it has none, migrate the local credential/reference.
- Remove the obsolete `local-foo` entry only after the merged configuration and credential reference persist successfully.

Migration is restart-safe. Partial failures leave the original source intact and emit a sanitized diagnostic without secret values.

## Keychain credential storage

### Scope

All API keys entered through Settings → Providers use macOS Keychain. OAuth credentials remain managed by Pi's OAuth storage and are out of scope.

### Keychain store

Create a main-process `KeychainCredentialStore` that encapsulates process execution and exposes typed operations:

- `read(service): Promise<string>`
- `writeManaged(service, secret): Promise<void>`
- `validateExternal(service): Promise<void>`
- `removeManaged(service): Promise<void>`

Commands use argument arrays rather than a shell:

- Read: `security find-generic-password -s <service> -w`
- Write/update: `security add-generic-password -U -a MacPi -s <service> -w <secret>`
- Delete: `security delete-generic-password -s <service>`

Secrets must never be included in logs or user-visible command errors. Tests inject a fake command runner.

### Credential references

Persist only non-secret references keyed by provider ID:

```ts
interface ProviderKeychainReference {
  service: string;
  managed: boolean;
}
```

- Direct entry creates/updates `io.0112.macpi.provider.<provider-id>` with `managed: true`.
- Existing service-name entry validates immediate readability and stores `managed: false`.
- Service name alone identifies an item; account input is not supported.

References live in a typed application setting or equivalent non-secret repository field and are validated on read.

### Runtime hydration

When `ModelAuthService` creates or reloads Pi `AuthStorage`, it resolves each reference through Keychain and applies the value with `AuthStorage.setRuntimeApiKey(provider, key)`. This provides credentials to built-in and custom providers without writing secrets to `auth.json`.

Unreadable references:

- Do not crash startup.
- Remove any stale runtime override for that provider.
- Surface a sanitized provider-auth diagnostic naming the service but not secret/stdout/stderr.

### API-key entry modes

Provider authentication UI offers two mutually exclusive modes:

1. **Enter API key** — password input; MacPi writes a managed Keychain item.
2. **Use Keychain service** — service-name input; MacPi validates and stores an external reference.

Replacing credentials follows the chosen mode. If replacing a managed reference with another service, delete the old managed item only after the new credential has been validated and persisted.

### Removal

When API-key auth or a custom provider is removed:

- Remove its runtime override and stored reference.
- Delete a managed Keychain item.
- Never delete an externally managed Keychain item.
- Preserve OAuth removal behavior.

## Plaintext API-key migration

At startup, migrate every stored `{ type: "api_key", key }` credential:

1. Derive `io.0112.macpi.provider.<provider-id>`.
2. Write the key to Keychain.
3. Read it back and require an exact match.
4. Persist the managed reference.
5. Apply the runtime override.
6. Remove the plaintext credential from auth storage.

The plaintext credential remains untouched if any earlier step fails. OAuth credentials are ignored. Migration is idempotent and must not duplicate or expose secrets.

## Providers screen

### Terminology

Replace all Local labels and descriptions with Custom:

- Filter: Custom
- Action: Add custom OpenAI-compatible provider
- Form heading and help text
- Provider kind badge/description
- Empty and error text

### Save without models

The custom-provider form may save with zero models. **Save provider** is disabled only for invalid required provider fields or an in-progress save, not because no models were fetched.

The form explains that models are optional and can be fetched or added later under Settings → Models. Fetch remains available during setup; a failed fetch does not prevent saving.

### Credential mode

The form and built-in API-key editor expose direct-key and Keychain-service modes. Renderer payloads contain a secret only for the direct-key operation and never receive it back.

## Custom model management

### Availability

Models shows custom model-management controls only when the selected configured provider ID starts with `custom-`.

### Fetch Models

**Fetch Models** retrieves `/models` using the selected custom provider's persisted base URL and resolved Keychain credential. The main process:

1. Loads provider configuration.
2. Resolves its Keychain credential.
3. Fetches model candidates.
4. Merges with existing models by ID.
5. Preserves existing/manual entries absent from the response.
6. Uses fetched names for new IDs and preserves explicit existing display names for duplicates.
7. Writes `models.json`, refreshes registry/model queries, and returns counts.

The UI saves immediately and displays pending, success, and sanitized error states.

### Add model

The add form contains:

- Required model ID.
- Optional display name; blank falls back to ID.

Add saves immediately. Duplicate ID updates the existing entry's display name rather than creating a duplicate.

### Remove model

Each custom model row has an explicit Remove action. Removal saves immediately and:

- Removes the model from `models.json`.
- Removes matching global favourite references.
- Does not silently change the saved default. If removed model was default, existing unavailable-default recovery remains visible in Defaults.

Fetch/Add/Remove errors do not discard the last persisted model list.

## Models screen integration

Keep provider navigation, search, Favourites, and All models disclosures. Custom-provider management controls appear above those sections.

A successful Add/Fetch/Remove invalidates provider/model/settings queries as needed. Rows continue to move between favourite sections through the existing serialized favourite persistence behavior.

A custom provider with zero models remains visible in the left provider list and presents Add/Fetch controls instead of a terminal no-model empty state.

## Searchable default-model popup

Replace `DefaultModelSelector`'s native select with an anchored searchable popup consistent with `ChatModelMenu`:

- Trigger displays current default or Automatic fallback.
- Search matches provider name, provider ID, model name, and model ID.
- Automatic fallback appears first.
- Favourites section lists configured favourite models.
- All section groups all configured models by provider.
- Favourite models intentionally also appear in All.
- Current default is marked visibly/accessibly.
- Unavailable saved default remains visible with recovery guidance.
- Escape/outside click closes when idle and restores focus.
- Pending save prevents dismissal; failures keep the popup open for retry.

This selector changes only the saved default for new chats.

## Main-process boundaries

Introduce focused services/helpers rather than adding raw file and process logic to renderer components:

- `KeychainCredentialStore` — `security` command boundary.
- Credential-reference parsing/persistence helper.
- Idempotent local-to-custom and plaintext-key migration orchestration.
- `ModelAuthService` methods for custom provider save, fetch/merge, add/update, and remove.

IPC remains typed. Secret-returning IPC responses are forbidden.

## Accessibility

- Credential mode is a labelled radio group or equivalent.
- API-key and service-name inputs have explicit labels and autocomplete behavior appropriate to secrets.
- Custom model controls have clear accessible names.
- Default popup trigger exposes expanded state and dialog relationship.
- Search, sections, current selection, pending state, and errors are announced semantically.
- Destructive Remove controls are visible and not hover-only.

## Testing

Automated tests cover:

1. Keychain commands use argument arrays and never leak secrets in errors/logs.
2. Managed write/read/update/delete and external validate/reference-only removal.
3. Plaintext API-key migration success, rollback, OAuth exclusion, and idempotency.
4. `local-*` migration across models, auth references, favourites, defaults, managed service names, and collision merge behavior.
5. Runtime AuthStorage hydration and unreadable-reference diagnostics.
6. API-key mode payloads and no secret round-trip.
7. Saving custom providers with zero models and fetch failure independence.
8. Custom Fetch merge-by-ID and immediate persistence.
9. Manual Add/update and Remove, including favourite cleanup and unchanged saved default.
10. Models custom controls, pending/success/error states, zero-model provider behavior, and existing favourite sections.
11. Default popup search, Automatic fallback, Favourites/All grouping, current/unavailable state, save success/failure, dismissal/focus, and pending guard.
12. Full regression coverage for OAuth, provider auth, session model/thinking selection, Defaults, and packaging.

## Out of scope

- Keychain account-name selection.
- Non-macOS credential stores.
- OAuth token migration.
- Editing arbitrary model metadata beyond ID and display name.
- Automatically changing an unavailable saved default.
- Removing manual-only models during Fetch.
