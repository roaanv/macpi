import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

function installActiveSession(
	manager: PiSessionManager,
	session: Record<string, unknown>,
	settingsManager: unknown,
): void {
	// biome-ignore lint/suspicious/noExplicitAny: focused unit test installs an SDK-shaped active session
	(manager as any).active.set("s1", {
		piSessionId: "s1",
		session,
		settingsManager,
		unsubscribe: () => undefined,
		proxySettings: {},
		modelSwitching: false,
	});
}

function deferred(): {
	promise: Promise<void>;
	resolve: () => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: () => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function settingsDefaults(
	provider: string | undefined,
	modelId: string | undefined,
) {
	let currentProvider = provider;
	let currentModelId = modelId;
	return {
		getGlobalSettings: vi.fn(() => ({
			defaultProvider: currentProvider,
			defaultModel: currentModelId,
		})),
		getDefaultProvider: vi.fn(() => currentProvider),
		getDefaultModel: vi.fn(() => currentModelId),
		setDefaultModelAndProvider: vi.fn(
			(nextProvider: string | undefined, nextModelId: string | undefined) => {
				currentProvider = nextProvider;
				currentModelId = nextModelId;
			},
		),
		flush: vi.fn().mockResolvedValue(undefined),
	};
}

const nextModel = { provider: "openai", id: "gpt-5" } as never;

describe("PiSessionManager.setSessionModel", () => {
	it("restores only global defaults when project defaults override them", async () => {
		const stored: Record<"global" | "project", string | undefined> = {
			global: undefined,
			project: undefined,
		};
		const storage = {
			withLock(
				scope: "global" | "project",
				update: (current: string | undefined) => string | undefined,
			): void {
				stored[scope] = update(stored[scope]);
			},
		};
		storage.withLock("global", () =>
			JSON.stringify({
				defaultProvider: "openai",
				defaultModel: "global",
			}),
		);
		storage.withLock("project", () =>
			JSON.stringify({
				defaultProvider: "anthropic",
				defaultModel: "project",
			}),
		);
		const settingsManager = SettingsManager.fromStorage(storage);
		const session = {
			isStreaming: false,
			setModel: vi.fn(async () => {
				settingsManager.setDefaultModelAndProvider("openai", "gpt-5");
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await manager.setSessionModel("s1", nextModel);

		expect(settingsManager.getGlobalSettings()).toMatchObject({
			defaultProvider: "openai",
			defaultModel: "global",
		});
		expect(settingsManager.getProjectSettings()).toMatchObject({
			defaultProvider: "anthropic",
			defaultModel: "project",
		});
		expect(settingsManager.getDefaultProvider()).toBe("anthropic");
		expect(settingsManager.getDefaultModel()).toBe("project");
	});

	it("restores and flushes prior defined Pi defaults", async () => {
		const settingsManager = settingsDefaults("anthropic", "claude-sonnet");
		const session = {
			isStreaming: false,
			setModel: vi.fn(async () => {
				settingsManager.setDefaultModelAndProvider("openai", "gpt-5");
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await manager.setSessionModel("s1", nextModel);

		expect(session.setModel).toHaveBeenCalledWith(nextModel);
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenNthCalledWith(
			1,
			"openai",
			"gpt-5",
		);
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenNthCalledWith(
			2,
			"anthropic",
			"claude-sonnet",
		);
		expect(settingsManager.getDefaultProvider()).toBe("anthropic");
		expect(settingsManager.getDefaultModel()).toBe("claude-sonnet");
		expect(settingsManager.flush).toHaveBeenCalledOnce();
	});

	it("restores prior unset Pi defaults by clearing both values", async () => {
		const settingsManager = settingsDefaults(undefined, undefined);
		const session = {
			isStreaming: false,
			setModel: vi.fn(async () => {
				settingsManager.setDefaultModelAndProvider("openai", "gpt-5");
			}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await manager.setSessionModel("s1", nextModel);

		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenLastCalledWith(
			undefined,
			undefined,
		);
		expect(settingsManager.getDefaultProvider()).toBeUndefined();
		expect(settingsManager.getDefaultModel()).toBeUndefined();
		expect(settingsManager.flush).toHaveBeenCalledOnce();
	});

	it("restores and flushes Pi defaults when AgentSession.setModel rejects", async () => {
		const settingsManager = settingsDefaults("anthropic", "claude-sonnet");
		const session = {
			isStreaming: false,
			setModel: vi.fn().mockRejectedValue(new Error("SDK switch failed")),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await expect(manager.setSessionModel("s1", nextModel)).rejects.toThrow(
			"SDK switch failed",
		);
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenCalledOnce();
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenCalledWith(
			"anthropic",
			"claude-sonnet",
		);
		expect(settingsManager.flush).toHaveBeenCalledOnce();
	});

	it("rejects overlapping switches without snapshotting transient defaults", async () => {
		const firstSwitch = deferred();
		const settingsManager = settingsDefaults("anthropic", "claude-sonnet");
		const session = {
			isStreaming: false,
			setModel: vi
				.fn()
				.mockImplementationOnce(async () => {
					settingsManager.setDefaultModelAndProvider("openai", "gpt-5");
					await firstSwitch.promise;
				})
				.mockImplementationOnce(async () => {
					settingsManager.setDefaultModelAndProvider("openai", "gpt-5");
				}),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		const switchA = manager.setSessionModel("s1", nextModel);
		expect(settingsManager.getDefaultProvider()).toBe("openai");
		expect(settingsManager.getDefaultModel()).toBe("gpt-5");

		await expect(manager.setSessionModel("s1", nextModel)).rejects.toThrow(
			"Cannot switch models while session s1 is already switching models",
		);
		expect(session.setModel).toHaveBeenCalledOnce();
		expect(settingsManager.getGlobalSettings).toHaveBeenCalledOnce();
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenCalledOnce();

		firstSwitch.reject(new Error("first switch failed"));
		await expect(switchA).rejects.toThrow("first switch failed");
		expect(settingsManager.getDefaultProvider()).toBe("anthropic");
		expect(settingsManager.getDefaultModel()).toBe("claude-sonnet");

		await expect(
			manager.setSessionModel("s1", nextModel),
		).resolves.toBeUndefined();
		expect(session.setModel).toHaveBeenCalledTimes(2);
		expect(settingsManager.getGlobalSettings).toHaveBeenCalledTimes(2);
		expect(settingsManager.getDefaultProvider()).toBe("anthropic");
		expect(settingsManager.getDefaultModel()).toBe("claude-sonnet");
		expect(settingsManager.getGlobalSettings()).toEqual({
			defaultProvider: "anthropic",
			defaultModel: "claude-sonnet",
		});
	});

	it("rejects when streaming starts between the initial and adjacent guards", async () => {
		const settingsManager = settingsDefaults("anthropic", "claude-sonnet");
		let streamingReadCount = 0;
		const session = {
			get isStreaming() {
				streamingReadCount += 1;
				return streamingReadCount === 2;
			},
			setModel: vi.fn(),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await expect(manager.setSessionModel("s1", nextModel)).rejects.toThrow(
			"Cannot switch models while session s1 is streaming",
		);
		expect(session.setModel).not.toHaveBeenCalled();
		expect(settingsManager.setDefaultModelAndProvider).toHaveBeenCalledWith(
			"anthropic",
			"claude-sonnet",
		);
		expect(settingsManager.flush).toHaveBeenCalledOnce();
	});

	it("rejects a streaming session immediately before switching", async () => {
		const settingsManager = settingsDefaults("anthropic", "claude-sonnet");
		const session = {
			isStreaming: true,
			setModel: vi.fn(),
		};
		const manager = new PiSessionManager();
		installActiveSession(manager, session, settingsManager);

		await expect(manager.setSessionModel("s1", nextModel)).rejects.toThrow(
			"Cannot switch models while session s1 is streaming",
		);
		expect(session.setModel).not.toHaveBeenCalled();
	});
});
