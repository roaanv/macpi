import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	AuthStorage,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import {
	getFavouriteModels,
	getProviderKeychainReferences,
	getSelectedModel as getSelectedModelSetting,
	removeProviderKeychainReference,
	setProviderKeychainReference,
} from "../shared/app-settings-keys";
import type {
	AuthSource,
	CustomOpenAIModelCandidate,
	CustomOpenAIProviderInput,
	ImportPiAuthModelsStatus,
	ModelSummary,
	OAuthEvent,
	OAuthLoginStart,
	ProviderAuthType,
	ProviderSummary,
	SelectedModelRef,
} from "../shared/model-auth-types";
import {
	generatedProviderKeychainService,
	type KeychainCredentialStore,
} from "./keychain-credential-store";

interface ModelAuthPiModule {
	AuthStorage: { create(authPath?: string): unknown };
	ModelRegistry: {
		create(authStorage: unknown, modelsJsonPath?: string): unknown;
	};
}

type PendingPrompt = {
	resolve(value: string | undefined): void;
	reject(error: Error): void;
};

type LoginState = {
	provider: string;
	abort: AbortController;
	prompts: Map<string, PendingPrompt>;
	events: OAuthEvent[];
};

export interface ModelAuthServiceDeps {
	macpiRoot: string;
	appSettings?: {
		getAll(): Record<string, unknown>;
		set(key: string, value: unknown): void;
	};
	loadPi?: () => Promise<ModelAuthPiModule>;
	fetch?: typeof fetch;
	keychain?: KeychainCredentialStore;
}

export class ModelAuthService {
	readonly authPath: string;
	readonly modelsPath: string;
	private initPromise: Promise<void> | null = null;
	private auth: AuthStorage | null = null;
	private registry: ModelRegistry | null = null;
	private readonly loadPi: () => Promise<ModelAuthPiModule>;
	private readonly fetchImpl: typeof fetch;
	private readonly oauthListeners = new Set<(event: OAuthEvent) => void>();
	private readonly logins = new Map<string, LoginState>();
	private readonly credentialDiagnostics = new Map<string, string>();

	constructor(private readonly deps: ModelAuthServiceDeps) {
		this.authPath = path.join(deps.macpiRoot, "auth.json");
		this.modelsPath = path.join(deps.macpiRoot, "models.json");
		this.loadPi =
			deps.loadPi ?? (async () => import("@earendil-works/pi-coding-agent"));
		this.fetchImpl = deps.fetch ?? fetch;
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
		this.auth = mod.AuthStorage.create(this.authPath) as AuthStorage;
		try {
			await this.migrateLocalProviders(this.auth);
		} catch {
			for (const provider of Object.keys(this.readModelsConfig().providers)) {
				if (provider.startsWith("local-")) {
					this.credentialDiagnostics.set(
						provider,
						"Could not migrate this provider to the custom-provider format.",
					);
				}
			}
		}
		await this.migrateAndHydrateApiKeys(this.auth);
		this.registry = mod.ModelRegistry.create(
			this.auth,
			this.modelsPath,
		) as ModelRegistry;
	}

	async getAuthStorage(): Promise<AuthStorage> {
		await this.ready();
		if (!this.auth) {
			throw new Error("ModelAuthService auth storage not initialized");
		}
		return this.auth;
	}

	async getModelRegistry(): Promise<ModelRegistry> {
		await this.ready();
		if (!this.registry) {
			throw new Error("ModelAuthService model registry not initialized");
		}
		return this.registry;
	}

	async refresh(): Promise<void> {
		const auth = await this.getAuthStorage();
		const registry = await this.getModelRegistry();
		auth.reload();
		await this.migrateAndHydrateApiKeys(auth);
		registry.refresh();
	}

	onOAuthEvent(listener: (event: OAuthEvent) => void): () => void {
		this.oauthListeners.add(listener);
		return () => {
			this.oauthListeners.delete(listener);
		};
	}

	async startOAuthLogin(provider: string): Promise<OAuthLoginStart> {
		const normalizedProvider = this.validateProviderId(provider);
		const auth = await this.getAuthStorage();
		const loginId = randomUUID();
		const state: LoginState = {
			provider: normalizedProvider,
			abort: new AbortController(),
			prompts: new Map(),
			events: [],
		};
		this.logins.set(loginId, state);

		void auth
			.login(normalizedProvider, {
				signal: state.abort.signal,
				onAuth: (info) => {
					this.emitOAuth({
						type: "oauth.authUrl",
						loginId,
						provider: normalizedProvider,
						url: info.url,
						instructions: info.instructions,
					});
				},
				onPrompt: (prompt) =>
					this.waitForOAuthPrompt(loginId, {
						type: "oauth.prompt",
						loginId,
						provider: normalizedProvider,
						promptId: randomUUID(),
						message: prompt.message,
						placeholder: prompt.placeholder,
					}),
				onProgress: (message) => {
					this.emitOAuth({
						type: "oauth.progress",
						loginId,
						provider: normalizedProvider,
						message,
					});
				},
				onManualCodeInput: () =>
					this.waitForOAuthPrompt(loginId, {
						type: "oauth.prompt",
						loginId,
						provider: normalizedProvider,
						promptId: randomUUID(),
						message: "Paste redirect URL",
						placeholder: "http://127.0.0.1/...",
					}),
				onSelect: (prompt) =>
					this.waitForOAuthPrompt(loginId, {
						type: "oauth.select",
						loginId,
						provider: normalizedProvider,
						promptId: randomUUID(),
						message: prompt.message,
						options: prompt.options.map((option) => option.id),
					}),
			})
			.then(async () => {
				await this.refresh();
				this.emitOAuth({
					type: "oauth.success",
					loginId,
					provider: normalizedProvider,
				});
			})
			.catch((e) => {
				if (state.abort.signal.aborted) return;
				this.emitOAuth({
					type: "oauth.error",
					loginId,
					provider: normalizedProvider,
					message: e instanceof Error ? e.message : String(e),
				});
			})
			.finally(() => {
				this.logins.delete(loginId);
			});

		return { loginId, events: [...state.events] };
	}

	respondOAuthPrompt(loginId: string, promptId: string, value: string): void {
		const state = this.logins.get(loginId);
		if (!state) throw new Error(`Unknown OAuth login ${loginId}`);
		const pending = state.prompts.get(promptId);
		if (!pending) throw new Error(`Unknown OAuth prompt ${promptId}`);
		state.prompts.delete(promptId);
		pending.resolve(value);
	}

	cancelOAuthLogin(loginId: string): void {
		const state = this.logins.get(loginId);
		if (!state) return;
		state.abort.abort();
		for (const pending of state.prompts.values()) {
			pending.reject(new Error("OAuth login cancelled"));
		}
		state.prompts.clear();
		this.logins.delete(loginId);
		this.emitOAuth({
			type: "oauth.cancelled",
			loginId,
			provider: state.provider,
		});
	}

	async saveApiKey(
		provider: string,
		credential:
			| string
			| { mode: "apiKey"; apiKey: string }
			| { mode: "keychainService"; service: string },
	): Promise<void> {
		const normalizedProvider = this.validateProviderId(provider);
		if (!this.deps.keychain) {
			const key =
				typeof credential === "string"
					? credential.trim()
					: credential.mode === "apiKey"
						? credential.apiKey.trim()
						: "";
			if (!key) throw new Error("API key cannot be empty");
			const auth = await this.getAuthStorage();
			auth.set(normalizedProvider, { type: "api_key", key });
			await this.refresh();
			return;
		}
		const keychain = this.requireKeychain();
		const previousReferences = this.getKeychainReferences();
		const previous = previousReferences[normalizedProvider];
		let service: string;
		let managed: boolean;
		let key: string;
		if (typeof credential === "string" || credential.mode === "apiKey") {
			key = (
				typeof credential === "string" ? credential : credential.apiKey
			).trim();
			if (!key) throw new Error("API key cannot be empty");
			service = generatedProviderKeychainService(normalizedProvider);
			managed = true;
			await keychain.writeManaged(service, key);
			if ((await keychain.read(service)) !== key)
				throw new Error("Could not verify Keychain credential");
		} else {
			service = credential.service.trim();
			await keychain.validateExternal(service);
			key = await keychain.read(service);
			managed = false;
		}
		this.saveKeychainReferences(
			setProviderKeychainReference(previousReferences, normalizedProvider, {
				service,
				managed,
			}),
		);
		const auth = await this.getAuthStorage();
		auth.setRuntimeApiKey(normalizedProvider, key);
		if (previous?.managed && previous.service !== service) {
			await keychain.removeManaged(previous.service);
		}
		await this.refresh();
	}

	async logoutProvider(provider: string): Promise<void> {
		const normalizedProvider = this.validateProviderId(provider);
		const auth = await this.getAuthStorage();
		const references = this.getKeychainReferences();
		const reference = references[normalizedProvider];
		auth.removeRuntimeApiKey?.(normalizedProvider);
		if (reference) {
			if (reference.managed)
				await this.requireKeychain().removeManaged(reference.service);
			this.saveKeychainReferences(
				removeProviderKeychainReference(references, normalizedProvider),
			);
		}
		auth.logout(normalizedProvider);
		this.credentialDiagnostics.delete(normalizedProvider);
		await this.refresh();
	}

	async getSelectedModel(): Promise<{
		model: SelectedModelRef | null;
		valid: boolean;
		error?: string;
	}> {
		const model = getSelectedModelSetting(
			this.deps.appSettings?.getAll() ?? {},
		);
		if (!model) return { model: null, valid: true };
		const registry = await this.getModelRegistry();
		if (registry.find(model.provider, model.modelId)) {
			return { model, valid: true };
		}
		return {
			model,
			valid: false,
			error: this.selectedModelMissingMessage(model),
		};
	}

	async setSelectedModel(model: SelectedModelRef | null): Promise<void> {
		if (!this.deps.appSettings) {
			throw new Error("ModelAuthService requires appSettings to set model");
		}
		if (model) {
			const registry = await this.getModelRegistry();
			if (!registry.find(model.provider, model.modelId)) {
				throw new Error(this.selectedModelMissingMessage(model));
			}
		}
		this.deps.appSettings.set("selectedModel", model);
	}

	async resolveSelectedModel(): Promise<Model<Api> | undefined> {
		const model = getSelectedModelSetting(
			this.deps.appSettings?.getAll() ?? {},
		);
		if (!model) return undefined;
		const registry = await this.getModelRegistry();
		const resolved = registry.find(model.provider, model.modelId);
		if (!resolved) throw new Error(this.selectedModelMissingMessage(model));
		return resolved;
	}

	async resolveConfiguredModel(ref: SelectedModelRef): Promise<Model<Api>> {
		const registry = await this.getModelRegistry();
		const model = registry.find(ref.provider, ref.modelId);
		if (!model) throw new Error(this.selectedModelMissingMessage(ref));
		if (!registry.getProviderAuthStatus(ref.provider).configured) {
			throw new Error(`Provider ${ref.provider} is not configured`);
		}
		return model;
	}

	async readModelsJson(): Promise<{
		path: string;
		text: string;
		registryError?: string;
	}> {
		const registry = await this.getModelRegistry();
		return {
			path: this.modelsPath,
			text: fs.existsSync(this.modelsPath)
				? fs.readFileSync(this.modelsPath, "utf8")
				: "",
			registryError: registry.getError(),
		};
	}

	async writeModelsJson(text: string): Promise<{ registryError?: string }> {
		const trimmed = text.trim();
		if (trimmed.length > 0) {
			try {
				JSON.parse(trimmed);
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				throw new Error(
					`macpi editor currently accepts strict JSON only: ${msg}`,
				);
			}
		}
		fs.mkdirSync(path.dirname(this.modelsPath), { recursive: true });
		fs.writeFileSync(this.modelsPath, text);
		await this.refresh();
		const registry = await this.getModelRegistry();
		return { registryError: registry.getError() };
	}

	getImportStatus(homeDir: string): ImportPiAuthModelsStatus {
		const sourceAuthPath = path.join(homeDir, ".pi", "agent", "auth.json");
		const sourceModelsPath = path.join(homeDir, ".pi", "agent", "models.json");
		return {
			sourceAuthExists: fs.existsSync(sourceAuthPath),
			sourceModelsExists: fs.existsSync(sourceModelsPath),
			destAuthExists: fs.existsSync(this.authPath),
			destModelsExists: fs.existsSync(this.modelsPath),
			sourceAuthPath,
			sourceModelsPath,
			destAuthPath: this.authPath,
			destModelsPath: this.modelsPath,
		};
	}

	async listCustomOpenAIModels(input: {
		baseUrl: string;
		apiKey: string;
	}): Promise<CustomOpenAIModelCandidate[]> {
		const baseUrl = this.normalizeBaseUrl(input.baseUrl);
		const apiKey = input.apiKey.trim();
		const headers: Record<string, string> = { Accept: "application/json" };
		if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
		const response = await this.fetchImpl(`${baseUrl}/models`, { headers });
		if (!response.ok) {
			throw new Error(`Failed to fetch models: HTTP ${response.status}`);
		}
		const body = (await response.json()) as {
			data?: Array<{ id?: unknown; name?: unknown }>;
		};
		const data = Array.isArray(body.data) ? body.data : [];
		const models = data
			.map((model) => ({
				id: typeof model.id === "string" ? model.id : "",
				name:
					typeof model.name === "string" && model.name.length > 0
						? model.name
						: typeof model.id === "string"
							? model.id
							: "",
			}))
			.filter((model) => model.id.length > 0);
		if (models.length === 0)
			throw new Error("No models returned from provider");
		return models;
	}

	async saveCustomOpenAIProvider(
		input: CustomOpenAIProviderInput,
	): Promise<{ provider: string }> {
		const provider = this.validateProviderId(input.providerId);
		if (!provider.startsWith("custom-")) {
			throw new Error("Custom provider id must start with custom-");
		}
		const name = input.name.trim();
		if (!name) throw new Error("Provider name cannot be empty");
		const baseUrl = this.normalizeBaseUrl(input.baseUrl);
		const credential = input.credential;
		if (
			typeof credential !== "string" &&
			credential.mode === "keychainService"
		) {
			const service = credential.service.trim();
			if (!service) throw new Error("Keychain service cannot be empty");
			await this.requireKeychain().validateExternal(service);
		}

		const config = this.readModelsConfig();
		config.providers[provider] = {
			name,
			baseUrl,
			api: "openai-completions",
			apiKey: this.localProviderEnvName(provider),
			authHeader: true,
			models: input.models.map((model) => ({
				id: model.id,
				name: model.name || model.id,
			})),
		};
		fs.mkdirSync(path.dirname(this.modelsPath), { recursive: true });
		fs.writeFileSync(this.modelsPath, `${JSON.stringify(config, null, 2)}\n`);

		await this.saveApiKey(provider, credential);

		return { provider };
	}

	async removeCustomProvider(providerId: string): Promise<void> {
		const provider = this.requireCustomProvider(providerId);
		const config = this.readModelsConfig();
		if (!config.providers[provider]) {
			throw new Error(`Custom provider ${provider} not found`);
		}
		delete config.providers[provider];
		await this.writeCustomModelsConfig(config);

		const auth = await this.getAuthStorage();
		auth.removeRuntimeApiKey?.(provider);
		auth.logout?.(provider);
		auth.remove?.(provider);

		const references = this.getKeychainReferences();
		const reference = references[provider];
		if (reference) {
			if (reference.managed && this.deps.keychain) {
				await this.deps.keychain.removeManaged(reference.service);
			}
			if (this.deps.appSettings) {
				this.saveKeychainReferences(
					removeProviderKeychainReference(references, provider),
				);
			}
		}

		this.credentialDiagnostics.delete(provider);
		if (this.deps.appSettings) {
			const settings = this.deps.appSettings.getAll();
			const favourites = getFavouriteModels(settings).filter(
				(item) => item.provider !== provider,
			);
			this.deps.appSettings.set("modelFavourites", favourites);
			const selected = getSelectedModelSetting(settings);
			if (selected?.provider === provider) {
				this.deps.appSettings.set("selectedModel", null);
			}
		}

		await this.refresh();
	}

	async fetchCustomProviderModels(
		providerId: string,
	): Promise<{ added: number; total: number }> {
		const provider = this.requireCustomProvider(providerId);
		const config = this.readModelsConfig();
		const providerConfig = config.providers[provider];
		if (!providerConfig)
			throw new Error(`Custom provider ${provider} not found`);
		const baseUrl =
			typeof providerConfig.baseUrl === "string" ? providerConfig.baseUrl : "";
		const reference = this.getKeychainReferences()[provider];
		if (!reference)
			throw new Error(`No Keychain credential configured for ${provider}`);
		const apiKey = await this.requireKeychain().read(reference.service);
		const fetched = await this.listCustomOpenAIModels({ baseUrl, apiKey });
		const existing = Array.isArray(providerConfig.models)
			? (providerConfig.models as Array<{ id?: unknown; name?: unknown }>)
			: [];
		const byId = new Map(
			existing
				.filter((model) => typeof model.id === "string")
				.map((model) => [model.id as string, model]),
		);
		let added = 0;
		for (const model of fetched) {
			if (!byId.has(model.id)) {
				byId.set(model.id, { id: model.id, name: model.name || model.id });
				added++;
			}
		}
		providerConfig.models = [...byId.values()];
		await this.writeCustomModelsConfig(config);
		return { added, total: byId.size };
	}

	async saveCustomModel(
		providerId: string,
		model: CustomOpenAIModelCandidate,
	): Promise<void> {
		const provider = this.requireCustomProvider(providerId);
		const id = model.id.trim();
		if (!id) throw new Error("Model id cannot be empty");
		const config = this.readModelsConfig();
		const providerConfig = config.providers[provider];
		if (!providerConfig)
			throw new Error(`Custom provider ${provider} not found`);
		const models = Array.isArray(providerConfig.models)
			? (providerConfig.models as Array<{ id?: unknown; name?: unknown }>)
			: [];
		const next = models.filter((item) => item.id !== id);
		next.push({ id, name: model.name.trim() || id });
		providerConfig.models = next;
		await this.writeCustomModelsConfig(config);
	}

	async removeCustomModel(providerId: string, modelId: string): Promise<void> {
		const provider = this.requireCustomProvider(providerId);
		const id = modelId.trim();
		const config = this.readModelsConfig();
		const providerConfig = config.providers[provider];
		if (!providerConfig)
			throw new Error(`Custom provider ${provider} not found`);
		const models = Array.isArray(providerConfig.models)
			? (providerConfig.models as Array<{ id?: unknown }>)
			: [];
		providerConfig.models = models.filter((item) => item.id !== id);
		await this.writeCustomModelsConfig(config);
		if (this.deps.appSettings) {
			const favourites = getFavouriteModels(
				this.deps.appSettings.getAll(),
			).filter((item) => !(item.provider === provider && item.modelId === id));
			this.deps.appSettings.set("modelFavourites", favourites);
		}
	}

	async importFromPi(input: {
		homeDir: string;
		auth: boolean;
		models: boolean;
		replaceExisting: boolean;
	}): Promise<{ copiedAuth: boolean; copiedModels: boolean }> {
		const status = this.getImportStatus(input.homeDir);
		let copiedAuth = false;
		let copiedModels = false;
		fs.mkdirSync(path.dirname(this.authPath), { recursive: true });

		if (input.auth && status.sourceAuthExists) {
			this.copyImportFile(
				status.sourceAuthPath,
				status.destAuthPath,
				input.replaceExisting,
			);
			try {
				fs.chmodSync(status.destAuthPath, 0o600);
			} catch {
				// Best effort only; Windows and some filesystems may not support chmod.
			}
			copiedAuth = true;
		}

		if (input.models && status.sourceModelsExists) {
			this.copyImportFile(
				status.sourceModelsPath,
				status.destModelsPath,
				input.replaceExisting,
			);
			copiedModels = true;
		}

		if (copiedAuth || copiedModels) await this.refresh();
		return { copiedAuth, copiedModels };
	}

	async listProviders(): Promise<ProviderSummary[]> {
		const auth = await this.getAuthStorage();
		const registry = await this.getModelRegistry();
		const allModels = registry.getAll();
		const availableModels = registry.getAvailable();
		const oauthProviders = auth.getOAuthProviders();
		const oauthProviderIds = new Set(oauthProviders.map((p) => p.id));
		const providerIds = new Set<string>();
		const keychainReferences = this.getKeychainReferences();

		for (const model of allModels) providerIds.add(model.provider);
		for (const provider of availableModels) providerIds.add(provider.provider);
		for (const provider of oauthProviders) providerIds.add(provider.id);
		for (const provider of auth.list()) providerIds.add(provider);
		for (const provider of Object.keys(keychainReferences))
			providerIds.add(provider);
		const configuredProviders = this.readModelsConfig().providers;
		for (const provider of Object.keys(configuredProviders))
			providerIds.add(provider);
		for (const provider of this.credentialDiagnostics.keys())
			providerIds.add(provider);

		return [...providerIds]
			.sort((a, b) => a.localeCompare(b))
			.map((provider) => {
				const modelCount = allModels.filter(
					(model) => model.provider === provider,
				).length;
				const availableModelCount = availableModels.filter(
					(model) => model.provider === provider,
				).length;
				const authStatus = registry.getProviderAuthStatus(provider);
				const credentialDiagnostic = this.credentialDiagnostics.get(provider);
				const keychainReference = keychainReferences[provider];
				const configName = configuredProviders[provider]?.name;
				return {
					id: provider,
					name:
						typeof configName === "string"
							? configName
							: registry.getProviderDisplayName(provider),
					authType: this.authTypeForProvider({
						provider,
						modelCount,
						supportsOAuth: oauthProviderIds.has(provider),
					}),
					authStatus: {
						configured:
							authStatus.configured ||
							(typeof auth.get === "function" && !!auth.get(provider)) ||
							(!!keychainReference && !credentialDiagnostic),
						source: authStatus.source as AuthSource | undefined,
						label: credentialDiagnostic ?? authStatus.label,
					},
					modelCount,
					availableModelCount,
					supportsOAuth: oauthProviderIds.has(provider),
					supportsStoredApiKey: !oauthProviderIds.has(provider),
				};
			});
	}

	async listModels(): Promise<{
		models: ModelSummary[];
		registryError?: string;
	}> {
		const registry = await this.getModelRegistry();
		return {
			models: this.summarizeModels(registry, registry.getAll()),
			registryError: registry.getError(),
		};
	}

	private summarizeModels(
		registry: ModelRegistry,
		models: Model<Api>[],
	): ModelSummary[] {
		return models.map((model) => ({
			provider: model.provider,
			providerName: registry.getProviderDisplayName(model.provider),
			id: model.id,
			name: model.name ?? model.id,
			authConfigured: registry.hasConfiguredAuth(model),
			usingOAuth: registry.isUsingOAuth(model),
			reasoning: Boolean(model.reasoning),
			thinkingLevels: Object.keys(model.thinkingLevelMap ?? {}),
			input: (model.input ?? ["text"]) as Array<"text" | "image">,
			contextWindow: model.contextWindow ?? 0,
			maxTokens: model.maxTokens ?? 0,
		}));
	}

	private waitForOAuthPrompt<
		T extends Extract<OAuthEvent, { promptId: string }>,
	>(loginId: string, event: T): Promise<string> {
		const state = this.logins.get(loginId);
		if (!state)
			return Promise.reject(new Error(`Unknown OAuth login ${loginId}`));
		return new Promise((resolve, reject) => {
			state.prompts.set(event.promptId, {
				resolve: (value) => resolve(value ?? ""),
				reject,
			});
			this.emitOAuth(event);
		});
	}

	private emitOAuth(event: OAuthEvent): void {
		this.logins.get(event.loginId)?.events.push(event);
		for (const listener of this.oauthListeners) listener(event);
	}

	private validateProviderId(provider: string): string {
		if (!/^[a-zA-Z0-9._-]+$/.test(provider)) {
			throw new Error("Invalid provider id");
		}
		return provider;
	}

	private normalizeBaseUrl(value: string): string {
		let url: URL;
		try {
			url = new URL(value.trim());
		} catch {
			throw new Error("Invalid provider URL");
		}
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("Provider URL must use http or https");
		}
		return url.toString().replace(/\/+$/, "");
	}

	private async migrateLocalProviders(auth: AuthStorage): Promise<void> {
		const config = this.readModelsConfig();
		const localIds = Object.keys(config.providers).filter((id) =>
			id.startsWith("local-"),
		);
		if (localIds.length === 0) return;
		const originalModelsText = fs.existsSync(this.modelsPath)
			? fs.readFileSync(this.modelsPath, "utf8")
			: null;
		const originalReferences = this.getKeychainReferences();
		let references = originalReferences;
		const settings = this.deps.appSettings?.getAll() ?? {};
		const originalFavourites = getFavouriteModels(settings);
		const originalSelected = getSelectedModelSetting(settings);
		let favourites = originalFavourites;
		let selected = originalSelected;
		const authMoves: Array<{
			localId: string;
			customId: string;
			credential: NonNullable<ReturnType<AuthStorage["get"]>>;
			customCredential: ReturnType<AuthStorage["get"]>;
		}> = [];
		const managedServicesToDelete: string[] = [];
		for (const localId of localIds) {
			const customId = `custom-${localId.slice("local-".length)}`;
			const localConfig = config.providers[localId];
			const customConfig = config.providers[customId];
			const localModels = Array.isArray(localConfig.models)
				? localConfig.models
				: [];
			const customModels = Array.isArray(customConfig?.models)
				? customConfig.models
				: [];
			const modelIds = new Set(
				customModels.map((model) => (model as { id?: unknown }).id),
			);
			config.providers[customId] = {
				...localConfig,
				...customConfig,
				models: [
					...customModels,
					...localModels.filter(
						(model) => !modelIds.has((model as { id?: unknown }).id),
					),
				],
			};
			const localCredential = auth.get(localId);
			if (localCredential) {
				authMoves.push({
					localId,
					customId,
					credential: localCredential,
					customCredential: auth.get(customId),
				});
			}
			const localReference = references[localId];
			if (localReference && !references[customId]) {
				if (localReference.managed && this.deps.keychain) {
					const key = await this.deps.keychain.read(localReference.service);
					const service = generatedProviderKeychainService(customId);
					await this.deps.keychain.writeManaged(service, key);
					if ((await this.deps.keychain.read(service)) !== key)
						throw new Error(
							`Could not migrate Keychain service for ${localId}`,
						);
					references = setProviderKeychainReference(references, customId, {
						service,
						managed: true,
					});
					managedServicesToDelete.push(localReference.service);
				} else {
					references = setProviderKeychainReference(
						references,
						customId,
						localReference,
					);
				}
			} else if (localReference?.managed && this.deps.keychain) {
				managedServicesToDelete.push(localReference.service);
			}
			references = removeProviderKeychainReference(references, localId);
			favourites = favourites.map((item) =>
				item.provider === localId ? { ...item, provider: customId } : item,
			);
			if (selected?.provider === localId)
				selected = { ...selected, provider: customId };
			delete config.providers[localId];
		}
		try {
			fs.mkdirSync(path.dirname(this.modelsPath), { recursive: true });
			fs.writeFileSync(this.modelsPath, `${JSON.stringify(config, null, 2)}\n`);
			if (this.deps.appSettings) {
				this.saveKeychainReferences(references);
				this.deps.appSettings.set("modelFavourites", favourites);
				this.deps.appSettings.set("selectedModel", selected);
			}
			for (const move of authMoves) {
				if (!auth.get(move.customId) && move.credential) {
					auth.set(move.customId, move.credential);
				}
				auth.remove(move.localId);
			}
		} catch (error) {
			if (originalModelsText === null)
				fs.rmSync(this.modelsPath, { force: true });
			else fs.writeFileSync(this.modelsPath, originalModelsText);
			if (this.deps.appSettings) {
				this.saveKeychainReferences(originalReferences);
				this.deps.appSettings.set("modelFavourites", originalFavourites);
				this.deps.appSettings.set("selectedModel", originalSelected);
			}
			for (const move of authMoves) {
				auth.set(move.localId, move.credential);
				if (move.customCredential)
					auth.set(move.customId, move.customCredential);
				else auth.remove(move.customId);
			}
			throw error;
		}
		if (this.deps.keychain) {
			for (const service of managedServicesToDelete) {
				try {
					await this.deps.keychain.removeManaged(service);
				} catch {
					// The migration is already committed; retaining an obsolete item is safer
					// than rolling back references to a service that may have been deleted.
				}
			}
		}
	}

	private requireCustomProvider(providerId: string): string {
		const provider = this.validateProviderId(providerId);
		if (!provider.startsWith("custom-"))
			throw new Error(`Provider ${provider} is not custom`);
		return provider;
	}

	private async writeCustomModelsConfig(config: {
		providers: Record<string, Record<string, unknown>>;
	}): Promise<void> {
		const previous = fs.existsSync(this.modelsPath)
			? fs.readFileSync(this.modelsPath, "utf8")
			: null;
		fs.mkdirSync(path.dirname(this.modelsPath), { recursive: true });
		fs.writeFileSync(this.modelsPath, `${JSON.stringify(config, null, 2)}\n`);
		try {
			await this.refresh();
		} catch (error) {
			if (previous === null) fs.rmSync(this.modelsPath, { force: true });
			else fs.writeFileSync(this.modelsPath, previous);
			throw error;
		}
	}

	private requireKeychain(): KeychainCredentialStore {
		if (!this.deps.keychain)
			throw new Error("Keychain credential store is unavailable");
		return this.deps.keychain;
	}

	private getKeychainReferences() {
		return getProviderKeychainReferences(this.deps.appSettings?.getAll() ?? {});
	}

	private saveKeychainReferences(
		references: ReturnType<typeof getProviderKeychainReferences>,
	): void {
		if (!this.deps.appSettings)
			throw new Error("App settings are required for Keychain credentials");
		this.deps.appSettings.set("providerKeychainReferences", references);
	}

	private async migrateAndHydrateApiKeys(auth: AuthStorage): Promise<void> {
		if (!this.deps.keychain || !this.deps.appSettings) return;
		let references = this.getKeychainReferences();
		for (const provider of auth.list()) {
			const credential = auth.get(provider);
			if (!credential || credential.type !== "api_key") continue;
			const service = generatedProviderKeychainService(provider);
			try {
				await this.deps.keychain.writeManaged(service, credential.key);
				if ((await this.deps.keychain.read(service)) !== credential.key) {
					throw new Error("Keychain verification failed");
				}
				references = setProviderKeychainReference(references, provider, {
					service,
					managed: true,
				});
				this.saveKeychainReferences(references);
				auth.setRuntimeApiKey(provider, credential.key);
				auth.remove(provider);
				this.credentialDiagnostics.delete(provider);
			} catch {
				this.credentialDiagnostics.set(
					provider,
					`Could not migrate credentials to Keychain service “${service}”.`,
				);
			}
		}
		await this.hydrateKeychainReferences(auth);
	}

	private async hydrateKeychainReferences(auth: AuthStorage): Promise<void> {
		if (!this.deps.keychain) return;
		for (const [provider, reference] of Object.entries(
			this.getKeychainReferences(),
		)) {
			try {
				auth.setRuntimeApiKey(
					provider,
					await this.deps.keychain.read(reference.service),
				);
				this.credentialDiagnostics.delete(provider);
			} catch {
				auth.removeRuntimeApiKey(provider);
				this.credentialDiagnostics.set(
					provider,
					`Keychain service “${reference.service}” is unavailable.`,
				);
			}
		}
	}

	private localProviderEnvName(provider: string): string {
		return `MACPI_CUSTOM_OPENAI_${provider.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_API_KEY`;
	}

	private readModelsConfig(): {
		providers: Record<string, Record<string, unknown>>;
	} {
		if (!fs.existsSync(this.modelsPath)) return { providers: {} };
		const text = fs.readFileSync(this.modelsPath, "utf8").trim();
		if (!text) return { providers: {} };
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new Error(
				`Cannot update custom provider: models.json is invalid: ${msg}`,
			);
		}
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error(
				"Cannot update custom provider: models.json root must be an object",
			);
		}
		const root = parsed as { providers?: unknown };
		if (
			!root.providers ||
			typeof root.providers !== "object" ||
			Array.isArray(root.providers)
		) {
			return { ...root, providers: {} } as {
				providers: Record<string, Record<string, unknown>>;
			};
		}
		return root as { providers: Record<string, Record<string, unknown>> };
	}

	private copyImportFile(
		sourcePath: string,
		destPath: string,
		replaceExisting: boolean,
	): void {
		if (fs.existsSync(destPath) && !replaceExisting) {
			throw new Error(`Destination exists: ${destPath}`);
		}
		fs.copyFileSync(sourcePath, destPath);
	}

	private selectedModelMissingMessage(model: SelectedModelRef): string {
		return `Selected model ${model.provider}/${model.modelId} not found`;
	}

	private authTypeForProvider(input: {
		provider: string;
		modelCount: number;
		supportsOAuth: boolean;
	}): ProviderAuthType {
		if (input.supportsOAuth) return "oauth";
		const provider = input.provider.toLowerCase();
		if (provider.includes("bedrock") || provider.includes("vertex")) {
			return "cloud";
		}
		if (input.modelCount > 0) return "api_key";
		return "unknown";
	}
}
