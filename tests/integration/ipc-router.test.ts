import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchService } from "../../src/main/branch-service";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import type { ExtensionsService } from "../../src/main/extensions-service";
import { IpcRouter } from "../../src/main/ipc-router";
import type { Logger } from "../../src/main/logger";
import type { NotesService } from "../../src/main/notes-service";
import type { PiSessionManager } from "../../src/main/pi-session-manager";
import type { PromptsService } from "../../src/main/prompts-service";
import { AppSettingsRepo } from "../../src/main/repos/app-settings";
import { ChannelSessionsRepo } from "../../src/main/repos/channel-sessions";
import { ChannelsRepo } from "../../src/main/repos/channels";
import type { SkillsService } from "../../src/main/skills-service";
import type { TimelineEntry } from "../../src/shared/timeline-types";

const { dialogShowOpenDialog } = vi.hoisted(() => ({
	dialogShowOpenDialog: vi.fn(),
}));
vi.mock("electron", () => ({
	ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
	dialog: { showOpenDialog: dialogShowOpenDialog },
	BrowserWindow: { getFocusedWindow: () => null },
	shell: { openPath: vi.fn() },
	app: { getPath: vi.fn(() => "/tmp/macpi-logs-test") },
}));

function makeStubLogger(): Logger {
	return {
		info: () => {},
		warn: () => {},
		error: () => {},
		flush: () => {},
		readRecent: () => [],
		close: () => {},
	};
}

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
	disposeSession: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-router-"));
	db = openDb({ filename: path.join(dir, "test.db") });
	runMigrations(db);
	dialogShowOpenDialog.mockReset();
	piSessionManagerMock = {
		createSession: vi.fn(),
		prompt: vi.fn(),
		clearQueue: vi.fn(),
		removeFromQueue: vi.fn(),
		abort: vi.fn(),
		attachSession: vi.fn(),
		getHistory: vi.fn(),
		disposeSession: vi.fn(),
	};
	const skillsServiceStub = {
		list: vi.fn().mockResolvedValue([]),
		read: vi.fn().mockResolvedValue({
			manifest: { name: "x", source: "local", relativePath: "x.md" },
			body: "",
		}),
		save: vi.fn().mockResolvedValue(undefined),
		setEnabled: vi.fn().mockResolvedValue(undefined),
		install: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	};
	const extensionsServiceStub = {
		list: vi.fn().mockResolvedValue({ extensions: [], loadErrors: [] }),
		read: vi.fn().mockResolvedValue({
			manifest: { name: "x", source: "local", relativePath: "x.ts", path: "" },
			body: "",
		}),
		save: vi.fn().mockResolvedValue(undefined),
		setEnabled: vi.fn().mockResolvedValue(undefined),
		install: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		lint: vi.fn().mockResolvedValue([]),
	};
	const promptsServiceStub = {
		list: vi.fn().mockResolvedValue([]),
		read: vi.fn().mockResolvedValue({
			manifest: {
				name: "x",
				description: "",
				source: "local",
				relativePath: "x.md",
			},
			body: "",
		}),
		save: vi.fn().mockResolvedValue(undefined),
		setEnabled: vi.fn().mockResolvedValue(undefined),
		install: vi.fn().mockResolvedValue(undefined),
	};
	const branchServiceStub = {
		getTree: vi.fn().mockResolvedValue({
			sessionId: "s1",
			leafEntryId: null,
			roots: [],
			hasBranches: false,
		}),
		navigateTree: vi.fn().mockResolvedValue(undefined),
		fork: vi.fn().mockResolvedValue({ newSessionId: "new-s" }),
		setEntryLabel: vi.fn().mockResolvedValue(undefined),
	};
	const notesServiceStub = {
		list: vi.fn().mockResolvedValue({ notes: [], preamble: "", mtime: 0 }),
		read: vi.fn().mockResolvedValue({ id: "n1", title: "", body: "", blob: "" }),
		save: vi.fn().mockResolvedValue({ ok: true, mtime: 0 }),
		create: vi.fn().mockResolvedValue({ id: "n1" }),
		delete: vi.fn().mockResolvedValue({ ok: true, mtime: 0 }),
	};
	router = new IpcRouter({
		channels: new ChannelsRepo(db),
		channelSessions: new ChannelSessionsRepo(db),
		piSessionManager: piSessionManagerMock as unknown as PiSessionManager,
		appSettings: new AppSettingsRepo(db),
		skillsService: skillsServiceStub as unknown as SkillsService,
		extensionsService: extensionsServiceStub as unknown as ExtensionsService,
		promptsService: promptsServiceStub as unknown as PromptsService,
		notesService: notesServiceStub as unknown as NotesService,
		branchService: branchServiceStub as unknown as BranchService,
		dialog: {
			openFolder: async ({ defaultPath }) => {
				const result = await dialogShowOpenDialog({
					properties: ["openDirectory"],
					defaultPath,
				});
				if (result.canceled || result.filePaths.length === 0) {
					return { path: null };
				}
				return { path: result.filePaths[0] };
			},
		},
		getDefaultCwd: () => "/Users/test/home",
		mainLogger: makeStubLogger(),
		rendererLogger: makeStubLogger(),
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
		if (list.ok)
			expect(list.data.sessions.map((s) => s.piSessionId)).toEqual(["sess-1"]);
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

	it("session.rename writes the user-set label", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-rename",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("session.rename", {
			piSessionId: "s-rename",
			label: "my work",
		});

		expect(r).toEqual({ ok: true, data: {} });
		const repo = new ChannelSessionsRepo(db);
		expect(repo.getMeta("s-rename")?.label).toBe("my work");
		expect(repo.getMeta("s-rename")?.labelUserSet).toBe(true);
	});

	it("session.delete removes the row and disposes the active pi session", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-del",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("session.delete", { piSessionId: "s-del" });

		expect(r).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s-del");
		const list = await router.dispatch("session.listForChannel", {
			channelId: c.data.id,
		});
		if (!list.ok) throw new Error("listForChannel failed");
		expect(list.data.sessions).toEqual([]);
	});

	it("channels.delete on a non-empty channel without force returns non_empty", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s1",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("channels.delete", { id: c.data.id });

		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.code).toBe("non_empty");
			expect(r.error.message).toContain("1");
		}
	});

	it("channels.delete with force=true cascades and disposes pi sessions", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s1",
			sessionFilePath: null,
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s2",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/tmp",
		});

		const r = await router.dispatch("channels.delete", {
			id: c.data.id,
			force: true,
		});

		expect(r).toEqual({ ok: true, data: {} });
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s1");
		expect(piSessionManagerMock.disposeSession).toHaveBeenCalledWith("s2");
		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		expect(list.data.channels).toHaveLength(0);
	});

	it("channels.delete on an empty channel succeeds without force", async () => {
		const c = await router.dispatch("channels.create", { name: "empty" });
		if (!c.ok) throw new Error("setup");

		const r = await router.dispatch("channels.delete", { id: c.data.id });

		expect(r).toEqual({ ok: true, data: {} });
	});

	it("session.getMeta returns the persisted label and cwd", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-meta",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/Users/x/repo",
		});

		const r = await router.dispatch("session.getMeta", {
			piSessionId: "s-meta",
		});

		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.data).toEqual({
				piSessionId: "s-meta",
				cwd: "/Users/x/repo",
				label: null,
			});
		}
	});

	it("session.getMeta returns not_found for unknown session", async () => {
		const r = await router.dispatch("session.getMeta", { piSessionId: "nope" });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error.code).toBe("not_found");
	});

	it("session.setFirstMessageLabel writes when label_user_set=0", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fm",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/Users/x/macpi",
		});

		const r = await router.dispatch("session.setFirstMessageLabel", {
			piSessionId: "s-fm",
			text: "macpi: fix the build",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.applied).toBe(true);
		const meta = await router.dispatch("session.getMeta", {
			piSessionId: "s-fm",
		});
		if (!meta.ok) throw new Error("getMeta failed");
		expect(meta.data.label).toBe("macpi: fix the build");
	});

	it("session.setFirstMessageLabel returns applied=false when user has set a label", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fm2",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/x",
		});
		await router.dispatch("session.rename", {
			piSessionId: "s-fm2",
			label: "user named",
		});

		const r = await router.dispatch("session.setFirstMessageLabel", {
			piSessionId: "s-fm2",
			text: "ignored",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.applied).toBe(false);
	});

	it("dialog.openFolder returns the selected path", async () => {
		dialogShowOpenDialog.mockResolvedValueOnce({
			canceled: false,
			filePaths: ["/Users/x/picked"],
		});
		const r = await router.dispatch("dialog.openFolder", {});
		expect(r).toEqual({ ok: true, data: { path: "/Users/x/picked" } });
	});

	it("dialog.openFolder returns null when cancelled", async () => {
		dialogShowOpenDialog.mockResolvedValueOnce({
			canceled: true,
			filePaths: [],
		});
		const r = await router.dispatch("dialog.openFolder", {});
		expect(r).toEqual({ ok: true, data: { path: null } });
	});

	it("settings.getDefaultCwd returns a non-empty path", async () => {
		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(typeof r.data.cwd).toBe("string");
			expect(r.data.cwd.length).toBeGreaterThan(0);
		}
	});

	it("session.findChannel returns the owning channel id", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-fc",
			sessionFilePath: null,
		});
		await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/x",
		});

		const r = await router.dispatch("session.findChannel", {
			piSessionId: "s-fc",
		});

		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.channelId).toBe(c.data.id);
	});

	it("session.findChannel returns null for unknown session", async () => {
		const r = await router.dispatch("session.findChannel", {
			piSessionId: "no-such",
		});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.channelId).toBeNull();
	});

	it("settings.getAll returns the stored settings", async () => {
		const setR = await router.dispatch("settings.set", {
			key: "theme",
			value: "light",
		});
		expect(setR).toEqual({ ok: true, data: {} });

		const r = await router.dispatch("settings.getAll", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.settings).toEqual({ theme: "light" });
	});

	it("settings.set with a number round-trips", async () => {
		await router.dispatch("settings.set", {
			key: "fontSize.sidebar",
			value: 16,
		});
		const r = await router.dispatch("settings.getAll", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.settings["fontSize.sidebar"]).toBe(16);
	});

	it("channels.create persists cwd when provided", async () => {
		const c = await router.dispatch("channels.create", {
			name: "x",
			cwd: "/Users/x/code",
		});
		if (!c.ok) throw new Error("setup");

		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		const ch = list.data.channels.find((x) => x.id === c.data.id);
		expect(ch?.cwd).toBe("/Users/x/code");
	});

	it("channels.create stores null cwd when not provided", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");

		const list = await router.dispatch("channels.list", {});
		if (!list.ok) throw new Error("list failed");
		const ch = list.data.channels.find((x) => x.id === c.data.id);
		expect(ch?.cwd).toBeNull();
	});

	it("session.create resolves cwd from channel.cwd when override absent", async () => {
		const c = await router.dispatch("channels.create", {
			name: "x",
			cwd: "/from-channel",
		});
		if (!c.ok) throw new Error("setup");
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/from-channel",
		});
	});

	it("session.create resolves cwd from defaultCwd when channel.cwd null", async () => {
		const c = await router.dispatch("channels.create", { name: "x" });
		if (!c.ok) throw new Error("setup");
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/from-default",
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd2",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/from-default",
		});
	});

	it("session.create explicit override beats channel + default", async () => {
		const c = await router.dispatch("channels.create", {
			name: "x",
			cwd: "/channel",
		});
		if (!c.ok) throw new Error("setup");
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/default",
		});
		piSessionManagerMock.createSession.mockResolvedValueOnce({
			piSessionId: "s-cwd3",
			sessionFilePath: null,
		});

		const r = await router.dispatch("session.create", {
			channelId: c.data.id,
			cwd: "/explicit",
		});
		expect(r.ok).toBe(true);
		expect(piSessionManagerMock.createSession).toHaveBeenCalledWith({
			cwd: "/explicit",
		});
	});

	it("settings.getDefaultCwd returns the user-set defaultCwd when present", async () => {
		await router.dispatch("settings.set", {
			key: "defaultCwd",
			value: "/Users/x/configured",
		});

		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.cwd).toBe("/Users/x/configured");
	});

	it("settings.getDefaultCwd falls back to homeDir when defaultCwd unset", async () => {
		const r = await router.dispatch("settings.getDefaultCwd", {});
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.data.cwd).toBe("/Users/test/home");
	});
});
