import { afterEach, describe, expect, it, vi } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

const KEYS = [
	"HTTP_PROXY",
	"http_proxy",
	"HTTPS_PROXY",
	"https_proxy",
	"NO_PROXY",
	"no_proxy",
] as const;

const original = new Map<string, string | undefined>();
for (const key of KEYS) original.set(key, process.env[key]);

afterEach(() => {
	for (const key of KEYS) {
		const value = original.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

function fakeAppSettings(settings: Record<string, unknown>) {
	return {
		getAll: () => settings,
	};
}

function installActiveSession(
	manager: PiSessionManager,
	session: Record<string, unknown>,
	proxySettings: Record<string, unknown>,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: test reaches into internals
	(manager as any).active.set("s1", {
		piSessionId: "s1",
		session,
		unsubscribe: () => undefined,
		proxySettings,
	});
}

describe("PiSessionManager active session proxy env", () => {
	it("runs prompt with the active session's captured proxy env", async () => {
		delete process.env.HTTP_PROXY;
		let seen: string | undefined;
		const session = {
			prompt: vi.fn(async () => {
				seen = process.env.HTTP_PROXY;
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, {
			httpProxy: "http://captured.example.com:8080",
		});

		await manager.prompt("s1", "hello");

		expect(session.prompt).toHaveBeenCalledWith("hello", {
			source: "interactive",
			streamingBehavior: undefined,
		});
		expect(seen).toBe("http://captured.example.com:8080");
		expect(process.env.HTTP_PROXY).toBeUndefined();
	});

	it("does not use later app settings changes for an active prompt", async () => {
		delete process.env.HTTP_PROXY;
		let currentSettings: Record<string, unknown> = {
			httpProxy: "http://new.example.com:8080",
		};
		let seen: string | undefined;
		const session = {
			prompt: vi.fn(async () => {
				seen = process.env.HTTP_PROXY;
			}),
		};
		const manager = new PiSessionManager({
			// biome-ignore lint/suspicious/noExplicitAny: minimal AppSettingsRepo stub
			appSettings: fakeAppSettings(currentSettings) as any,
			homeDir: "/tmp",
		});
		installActiveSession(manager, session, {
			httpProxy: "http://captured.example.com:8080",
		});
		currentSettings = { httpProxy: "http://changed.example.com:8080" };

		await manager.prompt("s1", "hello");

		expect(seen).toBe("http://captured.example.com:8080");
		expect(process.env.HTTP_PROXY).toBeUndefined();
	});

	it("runs compact with the active session's captured proxy env", async () => {
		delete process.env.HTTPS_PROXY;
		let seen: string | undefined;
		const session = {
			compact: vi.fn(async () => {
				seen = process.env.HTTPS_PROXY;
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, {
			httpsProxy: "https://captured.example.com:8443",
		});

		await manager.compact("s1", "summarize");

		expect(session.compact).toHaveBeenCalledWith("summarize");
		expect(seen).toBe("https://captured.example.com:8443");
		expect(process.env.HTTPS_PROXY).toBeUndefined();
	});
});
