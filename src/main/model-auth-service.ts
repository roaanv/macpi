import fs from "node:fs";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { getSelectedModel as getSelectedModelSetting } from "../shared/app-settings-keys";
import type {
	AuthSource,
	ImportPiAuthModelsStatus,
	ModelSummary,
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
