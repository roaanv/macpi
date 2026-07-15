import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModelAuthService } from "../../src/main/model-auth-service";

function readModels(root: string) {
	return JSON.parse(fs.readFileSync(path.join(root, "models.json"), "utf8"));
}

describe("ModelAuthService custom model management", () => {
	it("fetches with the Keychain credential, merges, updates, and removes without changing the default", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-custom-models-"));
		fs.writeFileSync(
			path.join(root, "models.json"),
			JSON.stringify({
				providers: {
					"custom-demo": {
						name: "Demo",
						baseUrl: "https://example.test/v1",
						models: [
							{ id: "existing", name: "Explicit name" },
							{ id: "manual", name: "Manual only" },
						],
					},
				},
			}),
		);
		const values: Record<string, unknown> = {
			providerKeychainReferences: {
				"custom-demo": { service: "demo-service", managed: false },
			},
			modelFavourites: [{ provider: "custom-demo", modelId: "manual" }],
			selectedModel: { provider: "custom-demo", modelId: "manual" },
		};
		const runtime = new Map<string, string>();
		const auth = {
			list: () => [],
			get: () => undefined,
			set: vi.fn(),
			remove: vi.fn(),
			setRuntimeApiKey: (provider: string, key: string) =>
				runtime.set(provider, key),
			removeRuntimeApiKey: (provider: string) => runtime.delete(provider),
			reload: vi.fn(),
			getOAuthProviders: () => [],
			logout: vi.fn(),
		};
		const refresh = vi.fn();
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			expect((init?.headers as Record<string, string>).Authorization).toBe(
				"Bearer key-from-keychain",
			);
			return new Response(
				JSON.stringify({
					data: [
						{ id: "existing", name: "Fetched replacement" },
						{ id: "fetched", name: "Fetched model" },
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		const service = new ModelAuthService({
			macpiRoot: root,
			fetch: fetchMock as typeof fetch,
			keychain: {
				read: vi.fn(async () => "key-from-keychain"),
				writeManaged: vi.fn(),
				validateExternal: vi.fn(),
				removeManaged: vi.fn(),
			} as never,
			appSettings: {
				getAll: () => values,
				set: (key, value) => {
					values[key] = value;
				},
			},
			loadPi: async () => ({
				AuthStorage: { create: () => auth },
				ModelRegistry: {
					create: () => ({
						refresh,
						getAll: () => [],
						getAvailable: () => [],
						getError: () => undefined,
						find: () => undefined,
						getProviderAuthStatus: () => ({ configured: false }),
						getProviderDisplayName: () => "Demo",
						hasConfiguredAuth: () => true,
						isUsingOAuth: () => false,
					}),
				},
			}),
		});

		expect(
			(await service.listProviders()).find(
				(provider) => provider.id === "custom-demo",
			)?.authStatus.configured,
		).toBe(true);

		expect(await service.fetchCustomProviderModels("custom-demo")).toEqual({
			added: 1,
			total: 3,
		});
		let models = readModels(root).providers["custom-demo"].models;
		expect(models).toEqual([
			{ id: "existing", name: "Explicit name" },
			{ id: "manual", name: "Manual only" },
			{ id: "fetched", name: "Fetched model" },
		]);

		await service.saveCustomModel("custom-demo", {
			id: "manual",
			name: "Updated manual",
		});
		models = readModels(root).providers["custom-demo"].models;
		expect(
			models.filter((model: { id: string }) => model.id === "manual"),
		).toEqual([{ id: "manual", name: "Updated manual" }]);

		await service.removeCustomModel("custom-demo", "manual");
		models = readModels(root).providers["custom-demo"].models;
		expect(models.some((model: { id: string }) => model.id === "manual")).toBe(
			false,
		);
		expect(values.modelFavourites).toEqual([]);
		expect(values.selectedModel).toEqual({
			provider: "custom-demo",
			modelId: "manual",
		});
		expect(refresh).toHaveBeenCalledTimes(3);

		await service.removeCustomProvider("custom-demo");
		expect(readModels(root).providers).not.toHaveProperty("custom-demo");
		expect(values.providerKeychainReferences).toEqual({});
		expect(values.modelFavourites).toEqual([]);
		expect(values.selectedModel).toBeNull();
		expect(runtime.has("custom-demo")).toBe(false);
		expect(auth.logout).toHaveBeenCalledWith("custom-demo");
		expect(auth.remove).toHaveBeenCalledWith("custom-demo");
		expect(refresh).toHaveBeenCalledTimes(5);
	});
});
