import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { IpcRouter } from "../../src/main/ipc-router";
import type { PiSessionManager } from "../../src/main/pi-session-manager";
import { ChannelSessionsRepo } from "../../src/main/repos/channel-sessions";
import { ChannelsRepo } from "../../src/main/repos/channels";
import type { TimelineEntry } from "../../src/renderer/types/timeline";

vi.mock("electron", () => ({
	ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

let dir: string;
let db: DbHandle;
let router: IpcRouter;
let piSessionManagerMock: {
	createSession: ReturnType<typeof vi.fn>;
	prompt: ReturnType<typeof vi.fn>;
	clearQueue: ReturnType<typeof vi.fn>;
	removeFromQueue: ReturnType<typeof vi.fn>;
	abort: ReturnType<typeof vi.fn>;
	attachSession: ReturnType<typeof vi.fn>;
	getHistory: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-router-"));
	db = openDb({ filename: path.join(dir, "test.db") });
	runMigrations(db);
	piSessionManagerMock = {
		createSession: vi.fn(),
		prompt: vi.fn(),
		clearQueue: vi.fn(),
		removeFromQueue: vi.fn(),
		abort: vi.fn(),
		attachSession: vi.fn(),
		getHistory: vi.fn(),
	};
	router = new IpcRouter({
		channels: new ChannelsRepo(db),
		channelSessions: new ChannelSessionsRepo(db),
		piSessionManager: piSessionManagerMock as unknown as PiSessionManager,
	});
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("IpcRouter", () => {
	it("ping returns the echoed value", async () => {
		const r = await router.dispatch("ping", { value: "hi" });
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.value).toBe("hi");
	});

	it("channels.create then channels.list returns the new channel", async () => {
		const r1 = await router.dispatch("channels.create", { name: "scratch" });
		expect(r1.ok).toBe(true);
		const r2 = await router.dispatch("channels.list", {});
		expect(r2.ok).toBe(true);
		if (r2.ok) {
			expect(r2.data.channels.map((c) => c.name)).toEqual(["scratch"]);
		}
	});

	it("session.create rejects unknown channel", async () => {
		const r = await router.dispatch("session.create", {
			channelId: "nope",
			cwd: "/tmp",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe("not_found");
	});

	it("session.create attaches the returned pi session id to the channel", async () => {
		const created = await router.dispatch("channels.create", { name: "x" });
		if (!created.ok) throw new Error("setup: channel create failed");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "sess-1",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: created.data.id,
			cwd: "/tmp",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.piSessionId).toBe("sess-1");

		const list = await router.dispatch("session.listForChannel", {
			channelId: created.data.id,
		});
		expect(list.ok).toBe(true);
		if (list.ok) expect(list.data.piSessionIds).toEqual(["sess-1"]);
	});

	it("unknown method returns an unknown_method error", async () => {
		const r = await (
			router as unknown as {
				dispatch: (m: string, a: unknown) => Promise<unknown>;
			}
		).dispatch("does.not.exist", {});
		expect((r as { ok: boolean; error?: { code: string } }).ok).toBe(false);
		if (!(r as { ok: boolean }).ok) {
			expect((r as { error: { code: string } }).error.code).toBe(
				"unknown_method",
			);
		}
	});

	it("handler exceptions are caught and surfaced as `exception`", async () => {
		piSessionManagerMock.createSession.mockRejectedValueOnce(new Error("boom"));
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe("exception");
	});

	it("session.prompt forwards streamingBehavior to the manager", async () => {
		piSessionManagerMock.prompt.mockResolvedValue(undefined);

		const r1 = await router.dispatch("session.prompt", {
			piSessionId: "s1",
			text: "go",
		});
		const r2 = await router.dispatch("session.prompt", {
			piSessionId: "s1",
			text: "wait",
			streamingBehavior: "followUp",
		});

		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		expect(piSessionManagerMock.prompt).toHaveBeenCalledTimes(2);
		expect(piSessionManagerMock.prompt).toHaveBeenNthCalledWith(
			1,
			"s1",
			"go",
			undefined,
		);
		expect(piSessionManagerMock.prompt).toHaveBeenNthCalledWith(
			2,
			"s1",
			"wait",
			"followUp",
		);
	});

	it("session.clearQueue returns the cleared messages", async () => {
		piSessionManagerMock.clearQueue.mockResolvedValueOnce({
			steering: ["a"],
			followUp: ["b", "c"],
		});

		const result = await router.dispatch("session.clearQueue", {
			piSessionId: "s1",
		});

		expect(result).toEqual({
			ok: true,
			data: { steering: ["a"], followUp: ["b", "c"] },
		});
		expect(piSessionManagerMock.clearQueue).toHaveBeenCalledWith("s1");
	});

	it("session.abort returns ok with no payload", async () => {
		piSessionManagerMock.abort.mockResolvedValueOnce(undefined);

		const result = await router.dispatch("session.abort", {
			piSessionId: "s7",
		});

		expect(result).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.abort).toHaveBeenCalledWith("s7");
	});

	it("session.removeFromQueue forwards (piSessionId, queue, index) to the manager", async () => {
		piSessionManagerMock.removeFromQueue.mockResolvedValueOnce(undefined);

		const result = await router.dispatch("session.removeFromQueue", {
			piSessionId: "s1",
			queue: "followUp",
			index: 2,
		});

		expect(result).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.removeFromQueue).toHaveBeenCalledWith(
			"s1",
			"followUp",
			2,
		);
	});

	it("session.removeFromQueue surfaces manager errors as ipc errors", async () => {
		piSessionManagerMock.removeFromQueue.mockRejectedValueOnce(
			new Error("unknown session s1"),
		);

		const result = await router.dispatch("session.removeFromQueue", {
			piSessionId: "s1",
			queue: "steering",
			index: 0,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("unknown session s1");
		}
	});

	it("session.clearQueue surfaces manager errors as ipc errors", async () => {
		piSessionManagerMock.clearQueue.mockRejectedValueOnce(
			new Error("unknown session s1"),
		);

		const result = await router.dispatch("session.clearQueue", {
			piSessionId: "s1",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("unknown session s1");
		}
	});

	it("session.attach calls attachSession then returns the translated history", async () => {
		piSessionManagerMock.attachSession.mockResolvedValueOnce(undefined);
		piSessionManagerMock.getHistory.mockReturnValueOnce([
			{ kind: "user", id: "r1", text: "hi" },
		] as TimelineEntry[]);

		const result = await router.dispatch("session.attach", {
			piSessionId: "s1",
		});

		expect(result).toEqual({
			ok: true,
			data: { entries: [{ kind: "user", id: "r1", text: "hi" }] },
		});
		expect(piSessionManagerMock.attachSession).toHaveBeenCalledWith({
			piSessionId: "s1",
		});
		expect(piSessionManagerMock.getHistory).toHaveBeenCalledWith("s1");
	});

	it("session.attach surfaces attach errors as ipc errors", async () => {
		piSessionManagerMock.attachSession.mockRejectedValueOnce(
			new Error("session file not found on disk for s1"),
		);

		const result = await router.dispatch("session.attach", {
			piSessionId: "s1",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("session file not found");
		}
	});
});
