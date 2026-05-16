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
				AuthStorage: {
					create: (p: string) => (calls.push(`auth:${p}`), fakeAuthStorage()),
				},
				ModelRegistry: {
					create: (_auth: unknown, p: string) =>
						(calls.push(`models:${p}`), fakeModelRegistry()),
				},
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

describe("ModelAuthService selected model", () => {
	it("returns null when selected model is unset", async () => {
		const settings = fakeSettings({});
		const service = new ModelAuthService({
			macpiRoot: tempRoot(),
			appSettings: settings,
			loadPi: async () => ({
				AuthStorage: { create: () => fakeAuthStorage() },
				ModelRegistry: { create: () => fakeModelRegistry() },
			}),
		});

		await expect(service.getSelectedModel()).resolves.toEqual({
			model: null,
			valid: true,
		});
		await expect(service.resolveSelectedModel()).resolves.toBeUndefined();
	});

	it("validates and persists selected model references", async () => {
		const settings = fakeSettings({});
		const selected = fakeModel("anthropic", "claude-sonnet");
		const service = new ModelAuthService({
			macpiRoot: tempRoot(),
			appSettings: settings,
			loadPi: async () => ({
				AuthStorage: { create: () => fakeAuthStorage() },
				ModelRegistry: {
					create: () =>
						fakeModelRegistry({
							models: [selected],
							findModel: selected,
						}),
				},
			}),
		});

		await service.setSelectedModel({
			provider: "anthropic",
			modelId: "claude-sonnet",
		});

		expect(settings.getAll()).toEqual({
			selectedModel: { provider: "anthropic", modelId: "claude-sonnet" },
		});
		await expect(service.resolveSelectedModel()).resolves.toBe(selected);
	});

	it("rejects missing selected model references", async () => {
		const service = new ModelAuthService({
			macpiRoot: tempRoot(),
			appSettings: fakeSettings({
				selectedModel: { provider: "anthropic", modelId: "missing" },
			}),
			loadPi: async () => ({
				AuthStorage: { create: () => fakeAuthStorage() },
				ModelRegistry: { create: () => fakeModelRegistry() },
			}),
		});

		await expect(service.getSelectedModel()).resolves.toEqual({
			model: { provider: "anthropic", modelId: "missing" },
			valid: false,
			error: "Selected model anthropic/missing not found",
		});
		await expect(service.resolveSelectedModel()).rejects.toThrow(
			"Selected model anthropic/missing not found",
		);
		await expect(
			service.setSelectedModel({ provider: "anthropic", modelId: "missing" }),
		).rejects.toThrow("Selected model anthropic/missing not found");
	});
});

describe("ModelAuthService summaries", () => {
	it("combines model, OAuth, and stored credential providers", async () => {
		const root = tempRoot();
		const service = new ModelAuthService({
			macpiRoot: root,
			loadPi: async () => ({
				AuthStorage: {
					create: () =>
						fakeAuthStorage({
							storedProviders: ["anthropic"],
							oauthProviders: [{ id: "openai-codex", name: "OpenAI Codex" }],
						}),
				},
				ModelRegistry: {
					create: () =>
						fakeModelRegistry({
							models: [
								fakeModel("anthropic", "claude-sonnet", "Claude Sonnet"),
								fakeModel("anthropic", "claude-haiku", "Claude Haiku"),
							],
							availableModels: [fakeModel("anthropic", "claude-sonnet")],
							displayNames: { anthropic: "Anthropic" },
							authStatuses: {
								anthropic: {
									configured: true,
									source: "stored",
									label: "API key",
								},
								"openai-codex": { configured: false },
							},
						}),
				},
			}),
		});

		const providers = await service.listProviders();

		expect(providers.map((p) => p.id).sort()).toEqual([
			"anthropic",
			"openai-codex",
		]);
		expect(
			providers.find((p) => p.id === "openai-codex")?.supportsOAuth,
		).toBe(true);
		expect(providers.find((p) => p.id === "anthropic")?.modelCount).toBe(2);
		expect(
			providers.find((p) => p.id === "anthropic")?.availableModelCount,
		).toBe(1);
	});

	it("lists renderer-safe model summaries without secret fields", async () => {
		const root = tempRoot();
		const service = new ModelAuthService({
			macpiRoot: root,
			loadPi: async () => ({
				AuthStorage: { create: () => fakeAuthStorage() },
				ModelRegistry: {
					create: () =>
						fakeModelRegistry({
							models: [fakeModel("anthropic", "claude-sonnet", "Claude Sonnet")],
							displayNames: { anthropic: "Anthropic" },
							authenticatedModelKeys: new Set(["anthropic/claude-sonnet"]),
							oauthModelKeys: new Set(["anthropic/claude-sonnet"]),
							registryError: "bad models.json",
						}),
				},
			}),
		});

		const { models, registryError } = await service.listModels();

		expect(registryError).toBe("bad models.json");
		expect(models[0]).toMatchObject({
			provider: "anthropic",
			providerName: "Anthropic",
			id: "claude-sonnet",
			name: "Claude Sonnet",
			authConfigured: true,
			usingOAuth: true,
		});
		expect(models[0]).not.toHaveProperty("apiKey");
	});
});

function fakeModel(provider: string, id: string, name = id) {
	return {
		provider,
		id,
		name,
		reasoning: true,
		thinkingLevelMap: { high: "high", low: "low" },
		input: ["text"],
		contextWindow: 200_000,
		maxTokens: 8192,
	};
}

function fakeAuthStorage(opts?: {
	storedProviders?: string[];
	oauthProviders?: Array<{ id: string; name?: string }>;
}) {
	return {
		list: () => opts?.storedProviders ?? [],
		getOAuthProviders: () => opts?.oauthProviders ?? [],
		getAuthStatus: () => ({ configured: false }),
		drainErrors: () => [],
		reload: () => {},
	};
}

function fakeModelRegistry(opts?: {
	models?: ReturnType<typeof fakeModel>[];
	availableModels?: ReturnType<typeof fakeModel>[];
	displayNames?: Record<string, string>;
	authStatuses?: Record<string, { configured: boolean; source?: string; label?: string }>;
	authenticatedModelKeys?: Set<string>;
	oauthModelKeys?: Set<string>;
	registryError?: string;
	findModel?: ReturnType<typeof fakeModel>;
}) {
	return {
		getAll: () => opts?.models ?? [],
		getAvailable: () => opts?.availableModels ?? [],
		getError: () => opts?.registryError,
		refresh: () => {},
		find: (provider: string, modelId: string) =>
			opts?.findModel?.provider === provider && opts.findModel.id === modelId
				? opts.findModel
				: undefined,
		getProviderAuthStatus: (provider: string) =>
			opts?.authStatuses?.[provider] ?? { configured: false },
		getProviderDisplayName: (provider: string) =>
			opts?.displayNames?.[provider] ?? provider,
		hasConfiguredAuth: (model: ReturnType<typeof fakeModel>) =>
			opts?.authenticatedModelKeys?.has(`${model.provider}/${model.id}`) ?? false,
		isUsingOAuth: (model: ReturnType<typeof fakeModel>) =>
			opts?.oauthModelKeys?.has(`${model.provider}/${model.id}`) ?? false,
	};
}

function fakeSettings(initial: Record<string, unknown>) {
	const values = { ...initial };
	return {
		getAll: () => ({ ...values }),
		set: (key: string, value: unknown) => {
			values[key] = value;
		},
	};
}
