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

function fakeAuthStorage() {
	return {
		list: () => [],
		getOAuthProviders: () => [],
		getAuthStatus: () => ({ configured: false }),
		drainErrors: () => [],
		reload: () => {},
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
