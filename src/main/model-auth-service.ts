import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { getSelectedModel as getSelectedModelSetting } from "../shared/app-settings-keys";
import type {
	AuthSource,
	ImportPiAuthModelsStatus,
	ModelSummary,
	OAuthEvent,
	ProviderAuthType,
	ProviderSummary,
	SelectedModelRef,
} from "../shared/model-auth-types";

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
};

export interface ModelAuthServiceDeps {
	macpiRoot: string;
	appSettings?: {
		getAll(): Record<string, unknown>;
		set(key: string, value: unknown): void;
	};
	loadPi?: () => Promise<ModelAuthPiModule>;
}

export class ModelAuthService {
	readonly authPath: string;
	readonly modelsPath: string;
	private initPromise: Promise<void> | null = null;
	private auth: AuthStorage | null = null;
	private registry: ModelRegistry | null = null;
	private readonly loadPi: () => Promise<ModelAuthPiModule>;
	private readonly oauthListeners = new Set<(event: OAuthEvent) => void>();
	private readonly logins = new Map<string, LoginState>();

	constructor(private readonly deps: ModelAuthServiceDeps) {
		this.authPath = path.join(deps.macpiRoot, "auth.json");
		this.modelsPath = path.join(deps.macpiRoot, "models.json");
		this.loadPi = deps.loadPi ?? (async () => import("@earendil-works/pi-coding-agent"));
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
		registry.refresh();
	}

	onOAuthEvent(listener: (event: OAuthEvent) => void): () => void {
		this.oauthListeners.add(listener);
		return () => {
			this.oauthListeners.delete(listener);
		};
	}

	async startOAuthLogin(provider: string): Promise<{ loginId: string }> {
		const normalizedProvider = this.validateProviderId(provider);
		const auth = await this.getAuthStorage();
		const loginId = randomUUID();
		const state: LoginState = {
			provider: normalizedProvider,
			abort: new AbortController(),
			prompts: new Map(),
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

		return { loginId };
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

	async getSelectedModel(): Promise<{
		model: SelectedModelRef | null;
		valid: boolean;
		error?: string;
	}> {
		const model = getSelectedModelSetting(this.deps.appSettings?.getAll() ?? {});
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
		const model = getSelectedModelSetting(this.deps.appSettings?.getAll() ?? {});
		if (!model) return undefined;
		const registry = await this.getModelRegistry();
		const resolved = registry.find(model.provider, model.modelId);
		if (!resolved) throw new Error(this.selectedModelMissingMessage(model));
		return resolved;
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
				throw new Error(`macpi editor currently accepts strict JSON only: ${msg}`);
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

		for (const model of allModels) providerIds.add(model.provider);
		for (const provider of availableModels) providerIds.add(provider.provider);
		for (const provider of oauthProviders) providerIds.add(provider.id);
		for (const provider of auth.list()) providerIds.add(provider);

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
				return {
					id: provider,
					name: registry.getProviderDisplayName(provider),
					authType: this.authTypeForProvider({
						provider,
						modelCount,
						supportsOAuth: oauthProviderIds.has(provider),
					}),
					authStatus: {
						configured: authStatus.configured,
						source: authStatus.source as AuthSource | undefined,
						label: authStatus.label,
					},
					modelCount,
					availableModelCount,
					supportsOAuth: oauthProviderIds.has(provider),
					supportsStoredApiKey: !oauthProviderIds.has(provider),
				};
			});
	}

	async listModels(): Promise<{ models: ModelSummary[]; registryError?: string }> {
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

	private waitForOAuthPrompt<T extends Extract<OAuthEvent, { promptId: string }>>(
		loginId: string,
		event: T,
	): Promise<string> {
		const state = this.logins.get(loginId);
		if (!state) return Promise.reject(new Error(`Unknown OAuth login ${loginId}`));
		return new Promise((resolve, reject) => {
			state.prompts.set(event.promptId, {
				resolve: (value) => resolve(value ?? ""),
				reject,
			});
			this.emitOAuth(event);
		});
	}

	private emitOAuth(event: OAuthEvent): void {
		for (const listener of this.oauthListeners) listener(event);
	}

	private validateProviderId(provider: string): string {
		if (!/^[a-zA-Z0-9._-]+$/.test(provider)) {
			throw new Error("Invalid provider id");
		}
		return provider;
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
