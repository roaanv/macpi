import { afterEach, describe, expect, it, vi } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

const piMock = vi.hoisted(() => ({
	createAgentSession: vi.fn(),
}));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: { create: vi.fn(() => ({})) },
	ModelRegistry: { create: vi.fn(() => ({})) },
	createAgentSession: piMock.createAgentSession,
}));

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
	vi.clearAllMocks();
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

	it("runs removeFromQueue requeue prompts with the active session's captured proxy env", async () => {
		delete process.env.HTTP_PROXY;
		const seen: Array<string | undefined> = [];
		const session = {
			clearQueue: vi.fn(async () => ({
				steering: ["keep steer", "drop steer"],
				followUp: ["keep follow"],
			})),
			prompt: vi.fn(async () => {
				seen.push(process.env.HTTP_PROXY);
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, {
			httpProxy: "http://captured.example.com:8080",
		});

		await manager.removeFromQueue("s1", "steering", 1);

		expect(session.prompt).toHaveBeenNthCalledWith(1, "keep steer", {
			source: "interactive",
			streamingBehavior: "steer",
		});
		expect(session.prompt).toHaveBeenNthCalledWith(2, "keep follow", {
			source: "interactive",
			streamingBehavior: "followUp",
		});
		expect(seen).toEqual([
			"http://captured.example.com:8080",
			"http://captured.example.com:8080",
		]);
		expect(process.env.HTTP_PROXY).toBeUndefined();
	});

	it("captures activation-time proxy settings through createSession for later prompts", async () => {
		delete process.env.HTTP_PROXY;
		let currentSettings: Record<string, unknown> = {
			httpProxy: "http://captured.example.com:8080",
		};
		let seenAtCreate: string | undefined;
		let seenAtPrompt: string | undefined;
		const session = {
			sessionId: "created-1",
			sessionFile: "/tmp/created-1.jsonl",
			subscribe: vi.fn(() => () => undefined),
			prompt: vi.fn(async () => {
				seenAtPrompt = process.env.HTTP_PROXY;
			}),
		};
		piMock.createAgentSession.mockImplementationOnce(async () => {
			seenAtCreate = process.env.HTTP_PROXY;
			return { session };
		});
		const manager = new PiSessionManager({
			// biome-ignore lint/suspicious/noExplicitAny: minimal AppSettingsRepo stub
			appSettings: { getAll: () => currentSettings } as any,
			homeDir: "/tmp",
		});
		manager.__testOverrides = {
			authStorage: {},
			modelRegistry: {},
			resourceLoader: { reload: vi.fn(async () => undefined) },
			settingsManager: {},
			model: {},
			// biome-ignore lint/suspicious/noExplicitAny: test-only pi dependency stubs
		} as any;

		const created = await manager.createSession({ cwd: "/tmp/project" });
		currentSettings = { httpProxy: "http://changed.example.com:8080" };
		await manager.prompt(created.piSessionId, "hello");

		expect(created).toEqual({
			piSessionId: "created-1",
			sessionFilePath: "/tmp/created-1.jsonl",
		});
		expect(seenAtCreate).toBe("http://captured.example.com:8080");
		expect(seenAtPrompt).toBe("http://captured.example.com:8080");
		expect(process.env.HTTP_PROXY).toBeUndefined();
	});
});
