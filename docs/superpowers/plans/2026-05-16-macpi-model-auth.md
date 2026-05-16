# macpi Model Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make macpi own pi auth/model state under the macpi resource root, then expose provider auth, model selection, import, API-key auth, OAuth, and custom models through safe main-process services and renderer IPC.

**Architecture:** Add a long-lived main-process `ModelAuthService` that constructs `AuthStorage.create(<macpiRoot>/auth.json)` and `ModelRegistry.create(authStorage, <macpiRoot>/models.json)`. Inject that service into `PiSessionManager` and `IpcRouter`; the renderer sees only safe summaries and sends secrets one-way through IPC. Persist selected models as `{ provider, modelId }` in app settings, resolve the full SDK model at session creation, and never expose raw `auth.json`.

**Tech Stack:** Electron main process, React renderer, TypeScript, Vitest, pi SDK `AuthStorage` / `ModelRegistry`, existing `AppSettingsRepo`, existing `resourceRoot` helpers, existing `macpi:invoke` IPC envelope.

---

## Current code facts

- `src/main/pi-session-manager.ts` currently calls `AuthStorage.create()` and `ModelRegistry.create(auth)` in `ensureContext()`, so it defaults to `~/.pi/agent/*`.
- `src/main/index.ts` already resolves `macpiRoot = ensureResourceRoot(appSettings.getAll(), os.homedir())` and passes `appSettings/homeDir` into `PiSessionManager`.
- `src/shared/app-settings-keys.ts` already has `getResourceRoot(settings, homeDir)` defaulting to `~/.macpi`.
- `src/main/ipc-router.ts` already owns app settings IPC and can receive another service dependency.
- `src/renderer/components/GlobalSettingsDialog.tsx` currently has Theme, Font, Defaults categories.
- pi SDK facts from docs/types:
  - `AuthStorage.create(authPath?: string)`
  - `AuthStorage.set(provider, { type: "api_key", key })`
  - `AuthStorage.logout(provider)` / `AuthStorage.remove(provider)`
  - `AuthStorage.login(providerId, callbacks)`
  - `AuthStorage.getOAuthProviders()`
  - `AuthStorage.getAuthStatus(provider)`
  - `AuthStorage.drainErrors()`
  - `ModelRegistry.create(authStorage, modelsJsonPath?: string)`
  - `ModelRegistry.refresh()`
  - `ModelRegistry.getError()`
  - `ModelRegistry.getAll()` / `getAvailable()`
  - `ModelRegistry.find(provider, modelId)`
  - `ModelRegistry.hasConfiguredAuth(model)`
  - `ModelRegistry.isUsingOAuth(model)`
  - `ModelRegistry.getProviderAuthStatus(provider)`
  - `ModelRegistry.getProviderDisplayName(provider)`

## File map

### New shared files

- `src/shared/model-auth-types.ts` — renderer-safe provider/model/import/OAuth event types.

### New main files

- `src/main/model-auth-service.ts` — long-lived owner of macpi auth/model paths, SDK storage/registry, summaries, API-key auth, logout, model selection validation, raw `models.json`, import, OAuth login state.
- `tests/unit/model-auth-service.test.ts` — temp-dir tests for service paths, summaries, API-key save/logout, raw models file handling, selected model validation.
- `tests/unit/model-auth-oauth.test.ts` — callback/session tests for OAuth event bridging without real network auth.

### Modified main/shared files

- `src/main/pi-session-manager.ts` — accept optional `modelAuth` dependency; use macpi-owned `authStorage`/`modelRegistry`; resolve selected model at `createSession`, `attachSession`, and `attachSessionByFile`.
- `src/main/index.ts` — instantiate `ModelAuthService` after app settings/resource root setup; pass it into `PiSessionManager` and `IpcRouter`; forward OAuth events to BrowserWindows.
- `src/main/ipc-router.ts` — add `modelsAuth.*` handlers.
- `src/shared/ipc-types.ts` — add typed IPC request/response entries.
- `src/shared/app-settings-keys.ts` — add `selectedModel` accessor/types.

### Modified renderer files

- `src/renderer/queries.ts` — add model/auth query and mutation hooks.
- `src/renderer/components/GlobalSettingsDialog.tsx` — add Models & Auth category.
- `src/renderer/components/ModelsAuthSettings.tsx` — new UI category shell.
- `src/renderer/components/ProviderAuthList.tsx` — provider rows and API-key/logout actions.
- `src/renderer/components/ModelPicker.tsx` — searchable grouped model selector.
- `src/renderer/components/OAuthLoginDialog.tsx` — modal driven by OAuth events.
- `src/renderer/components/ModelsJsonEditor.tsx` — raw editor for `<macpiRoot>/models.json`.
- `src/renderer/components/ImportPiAuthModels.tsx` — import UI.

---

## Execution guardrails

Before editing any existing function/class/method in this repo, run GitNexus impact analysis for that symbol and report the blast radius. Minimum required checks during implementation:

```txt
gitnexus_impact({ target: "PiSessionManager", direction: "upstream" })
gitnexus_impact({ target: "IpcRouter", direction: "upstream" })
gitnexus_impact({ target: "GlobalSettingsDialog", direction: "upstream" })
gitnexus_impact({ target: "useSettings", direction: "upstream" })
```

If any result is HIGH or CRITICAL risk, stop and get user confirmation before editing that symbol.

---

## Phase 1 — Service boundary and macpi-owned files

### Task 1.1: Add shared model/auth types

**Files:**
- Create: `src/shared/model-auth-types.ts`
- Modify: `src/shared/ipc-types.ts`

- [ ] Create `src/shared/model-auth-types.ts` with renderer-safe shapes:

```ts
export type AuthSource =
	| "stored"
	| "runtime"
	| "environment"
	| "fallback"
	| "models_json_key"
	| "models_json_command";

export type ProviderAuthType = "oauth" | "api_key" | "custom" | "cloud" | "unknown";

export interface ProviderSummary {
	id: string;
	name: string;
	authType: ProviderAuthType;
	authStatus: {
		configured: boolean;
		source?: AuthSource;
		label?: string;
	};
	modelCount: number;
	availableModelCount: number;
	supportsOAuth: boolean;
	supportsStoredApiKey: boolean;
}

export interface ModelSummary {
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
}

export interface SelectedModelRef {
	provider: string;
	modelId: string;
}

export type OAuthEvent =
	| { type: "oauth.authUrl"; loginId: string; provider: string; url: string; instructions?: string }
	| { type: "oauth.deviceCode"; loginId: string; provider: string; code: string; url?: string; expiresAt?: number }
	| { type: "oauth.prompt"; loginId: string; provider: string; promptId: string; message: string; placeholder?: string }
	| { type: "oauth.select"; loginId: string; provider: string; promptId: string; message: string; options: string[] }
	| { type: "oauth.progress"; loginId: string; provider: string; message: string }
	| { type: "oauth.success"; loginId: string; provider: string }
	| { type: "oauth.error"; loginId: string; provider: string; message: string }
	| { type: "oauth.cancelled"; loginId: string; provider: string };

export interface ModelsJsonReadResult {
	path: string;
	text: string;
	registryError?: string;
}

export interface ImportPiAuthModelsStatus {
	sourceAuthExists: boolean;
	sourceModelsExists: boolean;
	destAuthExists: boolean;
	destModelsExists: boolean;
	sourceAuthPath: string;
	sourceModelsPath: string;
	destAuthPath: string;
	destModelsPath: string;
}
```

- [ ] Extend `src/shared/ipc-types.ts` imports:

```ts
import type {
	ImportPiAuthModelsStatus,
	ModelSummary,
	ModelsJsonReadResult,
	ProviderSummary,
	SelectedModelRef,
} from "./model-auth-types";
```

- [ ] Add these entries to `IpcMethods`:

```ts
	"modelsAuth.listProviders": {
		req: Record<string, never>;
		res: { providers: ProviderSummary[] };
	};
	"modelsAuth.listModels": {
		req: Record<string, never>;
		res: { models: ModelSummary[]; registryError?: string };
	};
	"modelsAuth.getSelectedModel": {
		req: Record<string, never>;
		res: { model: SelectedModelRef | null; valid: boolean; error?: string };
	};
	"modelsAuth.setSelectedModel": {
		req: { model: SelectedModelRef | null };
		res: Record<string, never>;
	};
	"modelsAuth.saveApiKey": {
		req: { provider: string; apiKey: string };
		res: Record<string, never>;
	};
	"modelsAuth.logoutProvider": {
		req: { provider: string };
		res: Record<string, never>;
	};
	"modelsAuth.startOAuthLogin": {
		req: { provider: string };
		res: { loginId: string };
	};
	"modelsAuth.respondOAuthPrompt": {
		req: { loginId: string; promptId: string; value: string };
		res: Record<string, never>;
	};
	"modelsAuth.cancelOAuthLogin": {
		req: { loginId: string };
		res: Record<string, never>;
	};
	"modelsAuth.readModelsJson": {
		req: Record<string, never>;
		res: ModelsJsonReadResult;
	};
	"modelsAuth.writeModelsJson": {
		req: { text: string };
		res: { registryError?: string };
	};
	"modelsAuth.getImportStatus": {
		req: Record<string, never>;
		res: ImportPiAuthModelsStatus;
	};
	"modelsAuth.importFromPi": {
		req: { auth: boolean; models: boolean; replaceExisting: boolean };
		res: { copiedAuth: boolean; copiedModels: boolean };
	};
```

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected before implementation may fail on unused imports if IPC entries are not yet referenced by code style; after this task it should typecheck if imports are used only as types.

- [ ] Commit:

```bash
git add src/shared/model-auth-types.ts src/shared/ipc-types.ts
git commit -m "feat(model-auth): add shared IPC types"
```

### Task 1.2: Add selected model settings accessor

**Files:**
- Modify: `src/shared/app-settings-keys.ts`
- Modify/Create: `tests/unit/app-settings-keys.test.ts`

- [ ] Add tests:

```ts
import { getSelectedModel } from "../../src/shared/app-settings-keys";

describe("selected model setting", () => {
	it("returns null when unset", () => {
		expect(getSelectedModel({})).toBeNull();
	});

	it("returns provider/modelId when valid", () => {
		expect(getSelectedModel({ selectedModel: { provider: "anthropic", modelId: "claude" } })).toEqual({
			provider: "anthropic",
			modelId: "claude",
		});
	});

	it("rejects malformed values", () => {
		expect(getSelectedModel({ selectedModel: { provider: "anthropic" } })).toBeNull();
		expect(getSelectedModel({ selectedModel: "anthropic/claude" })).toBeNull();
	});
});
```

- [ ] Run expected fail:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/app-settings-keys.test.ts
```

Expected: `getSelectedModel` is not exported.

- [ ] Add implementation to `src/shared/app-settings-keys.ts`:

```ts
export interface SelectedModelSetting {
	provider: string;
	modelId: string;
}

export function getSelectedModel(
	settings: Record<string, unknown>,
): SelectedModelSetting | null {
	const v = settings.selectedModel;
	if (!v || typeof v !== "object" || Array.isArray(v)) return null;
	const candidate = v as Record<string, unknown>;
	return typeof candidate.provider === "string" &&
		candidate.provider.length > 0 &&
		typeof candidate.modelId === "string" &&
		candidate.modelId.length > 0
		? { provider: candidate.provider, modelId: candidate.modelId }
		: null;
}
```

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/app-settings-keys.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/shared/app-settings-keys.ts tests/unit/app-settings-keys.test.ts
git commit -m "feat(settings): add selected model accessor"
```

### Task 1.3: Create `ModelAuthService` with macpi paths

**Files:**
- Create: `src/main/model-auth-service.ts`
- Create: `tests/unit/model-auth-service.test.ts`

- [ ] Write tests using a fake SDK surface so the service can be verified without touching real `~/.pi`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ModelAuthService } from "../../src/main/model-auth-service";

function tempRoot() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "macpi-model-auth-"));
}

describe("ModelAuthService paths", () => {
	it("uses auth.json and models.json under the provided macpi root", async () => {
		const root = tempRoot();
		const calls: string[] = [];
		const service = new ModelAuthService({
			macpiRoot: root,
			loadPi: async () => ({
				AuthStorage: { create: (p: string) => (calls.push(`auth:${p}`), fakeAuthStorage()) },
				ModelRegistry: { create: (_auth: unknown, p: string) => (calls.push(`models:${p}`), fakeModelRegistry()) },
			}),
		});

		await service.ready();

		expect(calls).toEqual([
			`auth:${path.join(root, "auth.json")}`,
			`models:${path.join(root, "models.json")}`,
		]);
		expect(fs.existsSync(root)).toBe(true);
	});
});

function fakeAuthStorage() {
	return {
		list: () => [],
		getOAuthProviders: () => [],
		getAuthStatus: () => ({ configured: false }),
		drainErrors: () => [],
	};
}

function fakeModelRegistry() {
	return {
		getAll: () => [],
		getAvailable: () => [],
		getError: () => undefined,
		refresh: () => {},
		find: () => undefined,
		getProviderAuthStatus: () => ({ configured: false }),
		getProviderDisplayName: (provider: string) => provider,
		hasConfiguredAuth: () => false,
		isUsingOAuth: () => false,
	};
}
```

- [ ] Run expected fail:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts
```

Expected: module not found.

- [ ] Create `src/main/model-auth-service.ts` with this initial implementation:

```ts
import fs from "node:fs";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ModelSummary, ProviderSummary } from "../shared/model-auth-types";

type PiCodingModule = typeof import("@earendil-works/pi-coding-agent");

export interface ModelAuthServiceDeps {
	macpiRoot: string;
	loadPi?: () => Promise<Pick<PiCodingModule, "AuthStorage" | "ModelRegistry">>;
}

export class ModelAuthService {
	readonly authPath: string;
	readonly modelsPath: string;
	private initPromise: Promise<void> | null = null;
	private auth: AuthStorage | null = null;
	private registry: ModelRegistry | null = null;
	private readonly loadPi: () => Promise<Pick<PiCodingModule, "AuthStorage" | "ModelRegistry">>;

	constructor(private readonly deps: ModelAuthServiceDeps) {
		this.authPath = path.join(deps.macpiRoot, "auth.json");
		this.modelsPath = path.join(deps.macpiRoot, "models.json");
		this.loadPi = deps.loadPi ?? (() => import("@earendil-works/pi-coding-agent"));
	}

	async ready(): Promise<void> {
		if (!this.initPromise) {
			this.initPromise = this.init();
		}
		await this.initPromise;
	}

	private async init(): Promise<void> {
		fs.mkdirSync(path.dirname(this.authPath), { recursive: true });
		const mod = await this.loadPi();
		this.auth = mod.AuthStorage.create(this.authPath);
		this.registry = mod.ModelRegistry.create(this.auth, this.modelsPath);
	}

	async getAuthStorage(): Promise<AuthStorage> {
		await this.ready();
		if (!this.auth) throw new Error("ModelAuthService auth storage not initialized");
		return this.auth;
	}

	async getModelRegistry(): Promise<ModelRegistry> {
		await this.ready();
		if (!this.registry) throw new Error("ModelAuthService model registry not initialized");
		return this.registry;
	}

	async refresh(): Promise<void> {
		const auth = await this.getAuthStorage();
		const registry = await this.getModelRegistry();
		auth.reload?.();
		registry.refresh();
	}

	async listProviders(): Promise<ProviderSummary[]> {
		await this.ready();
		return [];
	}

	async listModels(): Promise<{ models: ModelSummary[]; registryError?: string }> {
		const registry = await this.getModelRegistry();
		return { models: this.summarizeModels(registry.getAll()), registryError: registry.getError() };
	}

	private summarizeModels(models: Model<Api>[]): ModelSummary[] {
		return models.map((model) => ({
			provider: model.provider,
			providerName: model.provider,
			id: model.id,
			name: model.name ?? model.id,
			authConfigured: false,
			usingOAuth: false,
			reasoning: Boolean(model.reasoning),
			thinkingLevels: Object.keys(model.thinkingLevelMap ?? {}),
			input: (model.input ?? ["text"]) as Array<"text" | "image">,
			contextWindow: model.contextWindow ?? 0,
			maxTokens: model.maxTokens ?? 0,
		}));
	}
}
```

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts tests/unit/model-auth-service.test.ts
git commit -m "feat(model-auth): create macpi-owned service boundary"
```

## Phase 2 — Provider/model summaries and selected model persistence

### Task 2.1: Implement provider and model summaries

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `tests/unit/model-auth-service.test.ts`

- [ ] Add tests that fake:
  - two models for `anthropic`
  - one OAuth provider `openai-codex`
  - one stored credential provider
  - `getProviderAuthStatus` returning configured/unconfigured values

Expected assertions:

```ts
expect(providers.map((p) => p.id).sort()).toEqual(["anthropic", "openai-codex"]);
expect(providers.find((p) => p.id === "openai-codex")?.supportsOAuth).toBe(true);
expect(providers.find((p) => p.id === "anthropic")?.modelCount).toBe(2);
expect(models[0]).not.toHaveProperty("apiKey");
```

- [ ] Implement `listProviders()`:
  - `registry.getAll()` grouped by `model.provider`
  - `registry.getAvailable()` grouped by provider for `availableModelCount`
  - `auth.getOAuthProviders()` contributes providers even when no model currently exists
  - `auth.list()` contributes providers with stored credentials
  - Use `registry.getProviderDisplayName(id)` when possible
  - `authType` rules:
    - OAuth provider present → `oauth`
    - provider id includes `bedrock`/`vertex` → `cloud`
    - provider has models and no OAuth → `api_key`
    - provider only from custom model config → `custom`
    - fallback → `unknown`

- [ ] Implement `listModels()`:
  - derive provider name from `registry.getProviderDisplayName(model.provider)`
  - derive auth from `registry.hasConfiguredAuth(model)`
  - derive OAuth from `registry.isUsingOAuth(model)`
  - include `registry.getError()` as `registryError`

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts tests/unit/model-auth-service.test.ts
git commit -m "feat(model-auth): summarize providers and models"
```

### Task 2.2: Add selected model methods to service

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `tests/unit/model-auth-service.test.ts`

- [ ] Add constructor dep:

```ts
appSettings?: { getAll(): Record<string, unknown>; set(key: string, value: unknown): void };
```

- [ ] Add methods:

```ts
async getSelectedModel(): Promise<{ model: SelectedModelRef | null; valid: boolean; error?: string }>;
async setSelectedModel(model: SelectedModelRef | null): Promise<void>;
async resolveSelectedModel(): Promise<Model<Api> | undefined>;
```

- [ ] Behavior:
  - Read selected model using `getSelectedModel(this.deps.appSettings.getAll())`.
  - Store only `{ provider, modelId }` under key `selectedModel`.
  - For non-null set, validate `registry.find(provider, modelId)` exists.
  - `resolveSelectedModel()` returns `undefined` if unset; throws `Selected model provider/modelId not found` if set but missing.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts tests/unit/app-settings-keys.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts tests/unit/model-auth-service.test.ts
git commit -m "feat(model-auth): persist selected model reference"
```

## Phase 3 — Wire sessions to macpi-owned auth/model state

### Task 3.1: Inject `ModelAuthService` into `PiSessionManager`

**Files:**
- Modify: `src/main/pi-session-manager.ts`
- Modify/Create: `tests/unit/pi-session-manager-model-auth.test.ts`

- [ ] Run GitNexus impact first:

```txt
gitnexus_impact({ target: "PiSessionManager", direction: "upstream" })
```

- [ ] Extend `PiSessionManagerDeps`:

```ts
modelAuth?: {
	getAuthStorage(): Promise<AuthStorage>;
	getModelRegistry(): Promise<ModelRegistry>;
	resolveSelectedModel(): Promise<Model<Api> | undefined>;
};
```

- [ ] Update `ensureContext()` production path:
  - If `deps.modelAuth` exists, await service `getAuthStorage()` and `getModelRegistry()`.
  - Otherwise keep the existing `AuthStorage.create()` fallback for tests/legacy construction.

Target shape:

```ts
private async ensureContext(): Promise<PiContext> {
	if (this.ctx) return this.ctx;
	const mod = await loadPi();
	const auth = this.deps?.modelAuth
		? await this.deps.modelAuth.getAuthStorage()
		: mod.AuthStorage.create();
	const registry = this.deps?.modelAuth
		? await this.deps.modelAuth.getModelRegistry()
		: mod.ModelRegistry.create(auth);
	this.ctx = { mod, auth, registry };
	return this.ctx;
}
```

- [ ] Update every `createAgentSession` call in `createSession`, `attachSession`, and `attachSessionByFile` to pass:

```ts
model: ov?.model ?? (await this.deps?.modelAuth?.resolveSelectedModel()),
```

- [ ] Preserve test override precedence: `__testOverrides.model` wins.

- [ ] Add a unit test with fake `modelAuth` proving `getAuthStorage/getModelRegistry` are called and default pi paths are not constructed.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/pi-session-manager-model-auth.test.ts
cd /Users/roaanv/mycode/macpi && npx vitest run
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/pi-session-manager.ts tests/unit/pi-session-manager-model-auth.test.ts
git commit -m "feat(pi): use macpi-owned auth and model registry"
```

### Task 3.2: Instantiate service in main startup

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc-router.ts`

- [ ] Run GitNexus impact:

```txt
gitnexus_impact({ target: "IpcRouter", direction: "upstream" })
```

- [ ] Import `ModelAuthService` in `src/main/index.ts`.

- [ ] After `macpiRoot` is resolved, instantiate:

```ts
const modelAuthService = new ModelAuthService({
	macpiRoot,
	appSettings,
});
await modelAuthService.ready();
```

- [ ] Pass it into `PiSessionManager`:

```ts
const manager = new PiSessionManager({
	appSettings,
	homeDir: os.homedir(),
	modelAuth: modelAuthService,
});
```

- [ ] Add `modelAuthService` to `RouterDeps`:

```ts
modelAuthService: ModelAuthService;
```

- [ ] Pass it into `new IpcRouter({ ... })`.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/index.ts src/main/ipc-router.ts
git commit -m "feat(main): instantiate ModelAuthService"
```

## Phase 4 — Read-only IPC and renderer visibility

### Task 4.1: Add provider/model/selected model IPC handlers

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify/Create: `tests/unit/ipc-router-model-auth.test.ts`

- [ ] Add IPC router tests for:
  - `modelsAuth.listProviders`
  - `modelsAuth.listModels`
  - `modelsAuth.getSelectedModel`
  - `modelsAuth.setSelectedModel` success
  - `modelsAuth.setSelectedModel` invalid returns `err("model_not_found", ...)`

- [ ] Add handlers:

```ts
this.register("modelsAuth.listProviders", async () =>
	ok({ providers: await this.deps.modelAuthService.listProviders() }),
);
this.register("modelsAuth.listModels", async () =>
	ok(await this.deps.modelAuthService.listModels()),
);
this.register("modelsAuth.getSelectedModel", async () =>
	ok(await this.deps.modelAuthService.getSelectedModel()),
);
this.register("modelsAuth.setSelectedModel", async (args) => {
	try {
		await this.deps.modelAuthService.setSelectedModel(args.model);
		return ok({});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return err("model_not_found", msg);
	}
});
```

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/ipc-router-model-auth.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/ipc-router.ts tests/unit/ipc-router-model-auth.test.ts
git commit -m "feat(ipc): expose model auth read APIs"
```

### Task 4.2: Add renderer query hooks

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] Add hooks:

```ts
export function useModelAuthProviders() {
	return useQuery({
		queryKey: ["modelsAuth.providers"],
		queryFn: () => invoke("modelsAuth.listProviders", {}),
	});
}

export function useModelAuthModels() {
	return useQuery({
		queryKey: ["modelsAuth.models"],
		queryFn: () => invoke("modelsAuth.listModels", {}),
	});
}

export function useSelectedModel() {
	return useQuery({
		queryKey: ["modelsAuth.selectedModel"],
		queryFn: () => invoke("modelsAuth.getSelectedModel", {}),
	});
}

export function useSetSelectedModel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { model: { provider: string; modelId: string } | null }) =>
			invoke("modelsAuth.setSelectedModel", input),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["modelsAuth.selectedModel"] });
			qc.invalidateQueries({ queryKey: ["settings"] });
		},
	});
}
```

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/renderer/queries.ts
git commit -m "feat(renderer): add model auth query hooks"
```

### Task 4.3: Add read-only Models & Auth settings category

**Files:**
- Modify: `src/renderer/components/GlobalSettingsDialog.tsx`
- Create: `src/renderer/components/ModelsAuthSettings.tsx`
- Create: `src/renderer/components/ModelPicker.tsx`
- Create: `src/renderer/components/ProviderAuthList.tsx`

- [ ] Run GitNexus impact:

```txt
gitnexus_impact({ target: "GlobalSettingsDialog", direction: "upstream" })
```

- [ ] Add a category:

```tsx
import { ModelsAuthSettings } from "./ModelsAuthSettings";

{ id: "models-auth", label: "Models & Auth", render: () => <ModelsAuthSettings /> }
```

- [ ] `ModelsAuthSettings` layout:
  - Selected model summary at top.
  - Provider list below.
  - Model picker below.
  - Registry error banner if `listModels.registryError` exists.

- [ ] `ProviderAuthList` displays provider rows with:
  - provider name/id
  - configured/unconfigured
  - source label
  - model count
  - placeholder buttons disabled for auth actions until later phases

- [ ] `ModelPicker` displays:
  - search input
  - grouped models by provider
  - authenticated models enabled
  - unauthenticated models shown but not selected by default; button label `Configure auth first`

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Manual check:

```bash
cd /Users/roaanv/mycode/macpi && npm start
```

Expected: Settings → Models & Auth opens, provider/model summaries load, no secrets are visible.

- [ ] Commit:

```bash
git add src/renderer/components/GlobalSettingsDialog.tsx src/renderer/components/ModelsAuthSettings.tsx src/renderer/components/ModelPicker.tsx src/renderer/components/ProviderAuthList.tsx
git commit -m "feat(settings): show models and auth status"
```

## Phase 5 — Import from installed pi

### Task 5.1: Add import status/copy service methods

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `tests/unit/model-auth-service.test.ts`

- [ ] Add service methods:

```ts
getImportStatus(homeDir: string): ImportPiAuthModelsStatus;
importFromPi(input: { homeDir: string; auth: boolean; models: boolean; replaceExisting: boolean }): Promise<{ copiedAuth: boolean; copiedModels: boolean }>;
```

- [ ] Source paths:

```ts
path.join(homeDir, ".pi", "agent", "auth.json")
path.join(homeDir, ".pi", "agent", "models.json")
```

- [ ] Destination paths: `this.authPath`, `this.modelsPath`.

- [ ] Copy rules:
  - If source missing, copied flag is false.
  - If destination exists and `replaceExisting` is false, throw `Destination exists: <path>`.
  - After copying auth, chmod to `0o600` where supported.
  - After copying, call `await this.refresh()`.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts tests/unit/model-auth-service.test.ts
git commit -m "feat(model-auth): import auth and models from pi"
```

### Task 5.2: Add import IPC + UI

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `src/renderer/queries.ts`
- Create: `src/renderer/components/ImportPiAuthModels.tsx`
- Modify: `src/renderer/components/ModelsAuthSettings.tsx`

- [ ] IPC handlers:

```ts
this.register("modelsAuth.getImportStatus", async () =>
	ok(this.deps.modelAuthService.getImportStatus(os.homedir())),
);
this.register("modelsAuth.importFromPi", async (args) => {
	try {
		return ok(await this.deps.modelAuthService.importFromPi({ homeDir: os.homedir(), ...args }));
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return err("import_failed", msg);
	}
});
```

- [ ] Hooks invalidate provider/model/selected queries after success.

- [ ] UI:
  - Show source/destination paths.
  - Checkboxes: auth, models.
  - If destination exists, require user to tick `Replace existing macpi files`.
  - Button text `Import from installed pi`.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/ipc-router.ts src/renderer/queries.ts src/renderer/components/ImportPiAuthModels.tsx src/renderer/components/ModelsAuthSettings.tsx
git commit -m "feat(settings): import pi auth and models"
```

## Phase 6 — API key auth and logout

### Task 6.1: Add API key save/logout service and IPC

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/unit/model-auth-service.test.ts`
- Modify/Create: `tests/unit/ipc-router-model-auth.test.ts`

- [ ] Service methods:

```ts
async saveApiKey(provider: string, apiKey: string): Promise<void> {
	const normalizedProvider = this.validateProviderId(provider);
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) throw new Error("API key cannot be empty");
	const auth = await this.getAuthStorage();
	auth.set(normalizedProvider, { type: "api_key", key: trimmedKey });
	await this.refresh();
}

async logoutProvider(provider: string): Promise<void> {
	const normalizedProvider = this.validateProviderId(provider);
	const auth = await this.getAuthStorage();
	auth.logout(normalizedProvider);
	await this.refresh();
}

private validateProviderId(provider: string): string {
	if (!/^[a-zA-Z0-9._-]+$/.test(provider)) throw new Error("Invalid provider id");
	return provider;
}
```

- [ ] IPC handlers:

```ts
this.register("modelsAuth.saveApiKey", async (args) => {
	try {
		await this.deps.modelAuthService.saveApiKey(args.provider, args.apiKey);
		return ok({});
	} catch (e) {
		return err("auth_failed", e instanceof Error ? e.message : String(e));
	}
});
this.register("modelsAuth.logoutProvider", async (args) => {
	try {
		await this.deps.modelAuthService.logoutProvider(args.provider);
		return ok({});
	} catch (e) {
		return err("auth_failed", e instanceof Error ? e.message : String(e));
	}
});
```

- [ ] Tests assert response never includes API key.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts tests/unit/ipc-router-model-auth.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts src/main/ipc-router.ts tests/unit/model-auth-service.test.ts tests/unit/ipc-router-model-auth.test.ts
git commit -m "feat(model-auth): save API keys and logout providers"
```

### Task 6.2: Add API key/logout UI

**Files:**
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/ProviderAuthList.tsx`

- [ ] Add hooks `useSaveApiKey()` and `useLogoutProvider()`.
- [ ] Provider row actions:
  - OAuth provider: show `Sign in` disabled until OAuth phase; show `Sign out` when configured.
  - API key provider: show `Add / replace key` and `Remove stored key`.
  - Cloud provider: show text `Configured outside macpi` for environment/cloud sources.
- [ ] API key modal behavior:
  - password input
  - Save sends key to main
  - Close clears local input state
  - Never render the saved key back

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Manual check: add a fake provider key, refresh summaries, key value is not visible.

- [ ] Commit:

```bash
git add src/renderer/queries.ts src/renderer/components/ProviderAuthList.tsx
git commit -m "feat(settings): add API key auth controls"
```

## Phase 7 — OAuth login

### Task 7.1: Add OAuth event bridge in service

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Create/Modify: `tests/unit/model-auth-oauth.test.ts`

- [ ] Add a listener API:

```ts
onOAuthEvent(listener: (event: OAuthEvent) => void): () => void;
```

- [ ] Maintain login sessions:

```ts
type PendingPrompt = { resolve(value: string): void; reject(error: Error): void };
type LoginState = {
	provider: string;
	abort: AbortController;
	prompts: Map<string, PendingPrompt>;
};
```

- [ ] Implement:

```ts
async startOAuthLogin(provider: string): Promise<{ loginId: string }>;
respondOAuthPrompt(loginId: string, promptId: string, value: string): void;
cancelOAuthLogin(loginId: string): void;
```

- [ ] Callback rules:
  - `onAuth(info)` emits `oauth.authUrl` and does not expose tokens.
  - `onPrompt(prompt)` emits `oauth.prompt`, waits for `respondOAuthPrompt`.
  - `onProgress(message)` emits `oauth.progress`.
  - `onSelect(prompt)` emits `oauth.select`, waits for selected string.
  - `onManualCodeInput()` can reuse `onPrompt` with message `Paste redirect URL`.
  - success calls `refresh()` and emits `oauth.success`.
  - failure emits `oauth.error`.
  - cancel aborts, rejects pending prompts, emits `oauth.cancelled`.

- [ ] Tests use a fake auth storage `login(provider, callbacks)` that calls callbacks and verifies emitted events.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-oauth.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts tests/unit/model-auth-oauth.test.ts
git commit -m "feat(model-auth): bridge OAuth login events"
```

### Task 7.2: Wire OAuth IPC/events to renderer

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/preload/index.ts` or existing preload file
- Modify: `src/renderer/ipc.ts`
- Modify: `src/renderer/queries.ts`

- [ ] In `src/main/index.ts`, forward events:

```ts
modelAuthService.onOAuthEvent((event) => {
	for (const w of BrowserWindow.getAllWindows()) {
		w.webContents.send("macpi:oauth-event", event);
	}
});
```

- [ ] Add handlers for start/respond/cancel.
- [ ] Expose `macpi:oauth-event` in preload using the same safe pattern as `macpi:pi-event`.
- [ ] Add renderer helper `onOAuthEvent(listener)`.
- [ ] Add query hooks for start/respond/cancel.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/index.ts src/main/ipc-router.ts src/preload/index.ts src/renderer/ipc.ts src/renderer/queries.ts
git commit -m "feat(ipc): stream OAuth login events"
```

### Task 7.3: Add OAuth login dialog UI

**Files:**
- Create: `src/renderer/components/OAuthLoginDialog.tsx`
- Modify: `src/renderer/components/ModelsAuthSettings.tsx`
- Modify: `src/renderer/components/ProviderAuthList.tsx`

- [ ] Dialog states:
  - auth URL with `Open Browser` button
  - device code with copy button if available
  - prompt input
  - select options
  - progress log
  - success state with `Choose model from this provider`
  - error state with retry/cancel

- [ ] Browser open: use a new IPC method or existing safe external link handling. Prefer main-process `shell.openExternal(url)` through a narrow IPC `system.openExternalUrl` validating `http:`/`https:`.

- [ ] On success, invalidate providers/models/selected queries.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Manual smoke: start Codex OAuth and verify URL/prompt/progress displays without hanging the IPC call.

- [ ] Commit:

```bash
git add src/renderer/components/OAuthLoginDialog.tsx src/renderer/components/ModelsAuthSettings.tsx src/renderer/components/ProviderAuthList.tsx
git commit -m "feat(settings): add OAuth login flow"
```

## Phase 8 — Raw `models.json` editor

### Task 8.1: Add read/write raw models JSON service and IPC

**Files:**
- Modify: `src/main/model-auth-service.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `tests/unit/model-auth-service.test.ts`

- [ ] Service behavior:
  - `readModelsJson()` returns path, text `""` if file missing, and registry error.
  - `writeModelsJson(text)` parses as JSON first for immediate syntax feedback. Note: pi now supports JSONC-style comments/trailing commas, but v1 editor can require strict JSON unless we import pi’s JSONC parser. If strict JSON rejects a file pi would accept, show a clear error: `macpi editor currently accepts strict JSON only`.
  - Write to `this.modelsPath` only.
  - Call `refresh()`.
  - Return `registry.getError()`.

- [ ] IPC maps parse/write errors to `err("models_json_invalid", message)`.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run tests/unit/model-auth-service.test.ts tests/unit/ipc-router-model-auth.test.ts
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/model-auth-service.ts src/main/ipc-router.ts tests/unit/model-auth-service.test.ts
git commit -m "feat(model-auth): edit macpi models json"
```

### Task 8.2: Add raw editor UI

**Files:**
- Create: `src/renderer/components/ModelsJsonEditor.tsx`
- Modify: `src/renderer/queries.ts`
- Modify: `src/renderer/components/ModelsAuthSettings.tsx`

- [ ] UI:
  - Collapsible `Custom models` section.
  - Shows path.
  - Textarea with monospace font.
  - Save button.
  - Error banner for parse/registry errors.
  - After save, invalidate providers/models queries.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/renderer/components/ModelsJsonEditor.tsx src/renderer/queries.ts src/renderer/components/ModelsAuthSettings.tsx
git commit -m "feat(settings): add raw models json editor"
```

## Phase 9 — Auth/model error UX and final verification

### Task 9.1: Improve missing selected model/auth session errors

**Files:**
- Modify: `src/main/pi-session-manager.ts`
- Modify renderer banner component that displays `session.error` events, likely under `src/renderer/components/ChatPane.tsx` or timeline state components.

- [ ] If `resolveSelectedModel()` throws missing model, emit/propagate an error with code `model` and message `Selected model no longer exists. Open Models & Auth to choose a replacement.`
- [ ] If pi session creation fails because auth is missing, preserve existing `auth` code but update renderer action copy to `Open Models & Auth`.
- [ ] Do not silently choose a different model.

- [ ] Run:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Commit:

```bash
git add src/main/pi-session-manager.ts src/renderer
git commit -m "fix(model-auth): surface selected model and auth errors"
```

### Task 9.2: Full verification

**Files:**
- No code changes expected.

- [ ] Run unit/integration test suite:

```bash
cd /Users/roaanv/mycode/macpi && npx vitest run
```

Expected: PASS.

- [ ] Run typecheck:

```bash
cd /Users/roaanv/mycode/macpi && npx tsc --noEmit
```

Expected: PASS.

- [ ] Run GitNexus changed-scope check before any commit/merge:

```txt
gitnexus_detect_changes()
```

Expected: affected symbols match the model/auth/session/settings surfaces above only.

- [ ] Manual smoke matrix:
  - Fresh `~/.macpi` with no auth: Models & Auth shows providers/models and unauthenticated state.
  - Import from `~/.pi/agent`: copied files land under `~/.macpi`; provider auth updates.
  - Save API key: provider becomes configured; key is not displayed.
  - Logout: stored credential removed; env/model fallback source remains indicated if applicable.
  - Codex OAuth: browser flow starts, success refreshes summaries.
  - Select model: settings stores `{ provider, modelId }` only.
  - Create session: selected model is passed to pi.
  - Delete/rename/reload existing session: no regression.
  - Invalid `models.json`: editor shows error; app does not crash; built-in models remain listed.

- [ ] Final commit if verification required additional fixes:

```bash
git add .
git commit -m "test(model-auth): verify macpi auth and model flow"
```

---

## Suggested implementation order

1. Phase 1, because everything else depends on the service boundary.
2. Phase 3 immediately after Phase 1, so macpi stops depending on installed pi state early.
3. Phase 4 read-only UI, so the user can see what the new boundary is doing.
4. Phase 5 import, because otherwise users with working pi CLI auth hit avoidable auth failures.
5. Phase 6 API keys.
6. Phase 7 OAuth, because it is the weird interactive raccoon with a soldering iron.
7. Phase 8 custom models.
8. Phase 9 polish and verification.

## Scope deliberately deferred

- macOS Keychain backend.
- Simple custom provider form generator.
- Raw `auth.json` editor.
- Automatic first-run credential copying.
- Silent fallback to random available model.
- Sharing live auth state with installed pi.

## Self-review

- Spec coverage:
  - macpi-owned auth/model paths → Phase 1/3.
  - `PiSessionManager` dependency injection → Phase 3.
  - IPC provider/model list → Phase 4.
  - selected model persistence and session resolution → Phase 2/3.
  - import from installed pi → Phase 5.
  - API key save/remove → Phase 6.
  - OAuth flow → Phase 7.
  - raw `models.json` editor → Phase 8.
  - error handling/security → Phases 6–9 plus shared type rules.
- Placeholder scan: no open implementation placeholders; each deferred item is explicitly scoped out.
- Type consistency: selected model is consistently `{ provider, modelId }`; service name is consistently `ModelAuthService`; IPC prefix is consistently `modelsAuth.*`.
