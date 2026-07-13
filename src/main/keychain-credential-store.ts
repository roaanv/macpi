import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type ExecFileRunner = (
	file: string,
	args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

const execFileAsync = promisify(execFile);

const defaultRunner: ExecFileRunner = async (file, args) => {
	const result = await execFileAsync(file, [...args], { encoding: "utf8" });
	return { stdout: result.stdout, stderr: result.stderr };
};

function requireValue(value: string, label: string): string {
	if (!value.trim()) throw new Error(`${label} cannot be empty`);
	return value;
}

export function generatedProviderKeychainService(providerId: string): string {
	return `io.0112.macpi.provider.${requireValue(providerId, "Provider id")}`;
}

export class KeychainCredentialStore {
	constructor(private readonly run: ExecFileRunner = defaultRunner) {}

	async read(service: string): Promise<string> {
		const safeService = requireValue(service, "Keychain service").trim();
		try {
			const { stdout } = await this.run("security", [
				"find-generic-password",
				"-s",
				safeService,
				"-w",
			]);
			const secret = stdout.replace(/[\r\n]+$/, "");
			if (!secret) throw new Error("empty");
			return secret;
		} catch {
			throw new Error(`Could not read Keychain service ${safeService}`);
		}
	}

	async writeManaged(service: string, secret: string): Promise<void> {
		const safeService = requireValue(service, "Keychain service").trim();
		requireValue(secret, "API key");
		try {
			await this.run("security", [
				"add-generic-password",
				"-U",
				"-a",
				"MacPi",
				"-s",
				safeService,
				"-w",
				secret,
			]);
		} catch {
			throw new Error(`Could not write Keychain service ${safeService}`);
		}
	}

	async validateExternal(service: string): Promise<void> {
		await this.read(service);
	}

	async removeManaged(service: string): Promise<void> {
		const safeService = requireValue(service, "Keychain service").trim();
		try {
			await this.run("security", [
				"delete-generic-password",
				"-s",
				safeService,
			]);
		} catch {
			throw new Error(`Could not delete Keychain service ${safeService}`);
		}
	}
}
