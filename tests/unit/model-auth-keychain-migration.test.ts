import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModelAuthService } from "../../src/main/model-auth-service";

function root() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "macpi-keychain-migration-"));
}

function registry() {
	return {
		refresh: vi.fn(),
		getAll: () => [],
		getAvailable: () => [],
		getError: () => undefined,
		find: () => undefined,
		getProviderAuthStatus: () => ({ configured: false }),
		getProviderDisplayName: (id: string) => id,
		hasConfiguredAuth: () => false,
		isUsingOAuth: () => false,
	};
}

describe("ModelAuthService Keychain migrations", () => {
	it("migrates plaintext API keys and local provider references without exposing secrets", async () => {
		const dir = root();
		fs.writeFileSync(
			path.join(dir, "models.json"),
			JSON.stringify({
				providers: {
					"local-demo": {
						name: "Local",
						baseUrl: "https://example.test/v1",
						models: [{ id: "old" }],
					},
					"custom-demo": {
						name: "Custom",
						baseUrl: "https://new.test/v1",
						models: [{ id: "new" }],
					},
				},
			}),
		);
		const credentials: Record<string, unknown> = {
			"local-demo": { type: "api_key", key: "super-secret" },
		};
		const runtime = new Map<string, string>();
		const auth = {
			list: () => Object.keys(credentials),
			get: (id: string) => credentials[id],
			set: (id: string, value: unknown) => {
				credentials[id] = value;
			},
			remove: (id: string) => {
				delete credentials[id];
			},
			setRuntimeApiKey: (id: string, key: string) => runtime.set(id, key),
			removeRuntimeApiKey: (id: string) => runtime.delete(id),
			reload: vi.fn(),
			getOAuthProviders: () => [],
			logout: vi.fn(),
		};
		const values: Record<string, unknown> = {
			providerKeychainReferences: {
				"local-demo": { service: "old-service", managed: false },
			},
			modelFavourites: [{ provider: "local-demo", modelId: "old" }],
			selectedModel: { provider: "local-demo", modelId: "old" },
		};
		const secrets = new Map<string, string>([["old-service", "super-secret"]]);
		const keychain = {
			read: vi.fn(async (service: string) => {
				const value = secrets.get(service);
				if (!value) throw new Error("missing");
				return value;
			}),
			writeManaged: vi.fn(async (service: string, secret: string) => {
				secrets.set(service, secret);
			}),
			validateExternal: vi.fn(),
			removeManaged: vi.fn(async (service: string) => {
				secrets.delete(service);
			}),
		};
		const service = new ModelAuthService({
			macpiRoot: dir,
			keychain: keychain as never,
			appSettings: {
				getAll: () => values,
				set: (key, value) => {
					values[key] = value;
				},
			},
			loadPi: async () => ({
				AuthStorage: { create: () => auth },
				ModelRegistry: { create: () => registry() },
			}),
		});
		await service.ready();

		const config = JSON.parse(
			fs.readFileSync(path.join(dir, "models.json"), "utf8"),
		);
		expect(config.providers["local-demo"]).toBeUndefined();
		expect(config.providers["custom-demo"].name).toBe("Custom");
		expect(
			config.providers["custom-demo"].models.map((m: { id: string }) => m.id),
		).toEqual(["new", "old"]);
		expect(values.modelFavourites).toEqual([
			{ provider: "custom-demo", modelId: "old" },
		]);
		expect(values.selectedModel).toEqual({
			provider: "custom-demo",
			modelId: "old",
		});
		expect(credentials["local-demo"]).toBeUndefined();
		expect(credentials["custom-demo"]).toBeUndefined();
		expect(runtime.get("custom-demo")).toBe("super-secret");
		expect(JSON.stringify(values)).not.toContain("super-secret");
	});
});
