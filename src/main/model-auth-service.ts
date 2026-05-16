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
	private readonly loadPi: () => Promise<
		Pick<PiCodingModule, "AuthStorage" | "ModelRegistry">
	>;

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

	async listProviders(): Promise<ProviderSummary[]> {
		await this.ready();
		return [];
	}

	async listModels(): Promise<{ models: ModelSummary[]; registryError?: string }> {
		const registry = await this.getModelRegistry();
		return {
			models: this.summarizeModels(registry.getAll()),
			registryError: registry.getError(),
		};
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
