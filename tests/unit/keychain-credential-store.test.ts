import { describe, expect, it, vi } from "vitest";
import {
	generatedProviderKeychainService,
	KeychainCredentialStore,
} from "../../src/main/keychain-credential-store";

describe("KeychainCredentialStore", () => {
	it("uses argument arrays for read, write, validate, and delete", async () => {
		const run = vi
			.fn()
			.mockResolvedValue({ stdout: " secret value \n", stderr: "" });
		const store = new KeychainCredentialStore(run);
		expect(await store.read("svc")).toBe(" secret value ");
		await store.writeManaged("svc", "top-secret");
		await store.validateExternal("svc");
		await store.removeManaged("svc");
		expect(run.mock.calls).toEqual([
			["security", ["find-generic-password", "-s", "svc", "-w"]],
			[
				"security",
				[
					"add-generic-password",
					"-U",
					"-a",
					"MacPi",
					"-s",
					"svc",
					"-w",
					"top-secret",
				],
			],
			["security", ["find-generic-password", "-s", "svc", "-w"]],
			["security", ["delete-generic-password", "-s", "svc"]],
		]);
	});

	it("sanitizes command failures", async () => {
		const run = vi
			.fn()
			.mockRejectedValue(new Error("stderr contains top-secret"));
		const store = new KeychainCredentialStore(run);
		await expect(store.writeManaged("svc", "top-secret")).rejects.toThrow(
			"Could not write Keychain service svc",
		);
		await expect(store.writeManaged("svc", "top-secret")).rejects.not.toThrow(
			"top-secret",
		);
	});

	it("validates inputs and generates stable managed services", async () => {
		const store = new KeychainCredentialStore(vi.fn());
		await expect(store.read(" ")).rejects.toThrow(
			"Keychain service cannot be empty",
		);
		await expect(store.writeManaged("svc", "")).rejects.toThrow(
			"API key cannot be empty",
		);
		expect(generatedProviderKeychainService("custom-foo")).toBe(
			"io.0112.macpi.provider.custom-foo",
		);
	});
});
