import { describe, expect, it, vi } from "vitest";
import { BranchService } from "../../src/main/branch-service";

function fakeSessionManager(opts: { roots: unknown[]; leafId: string | null }) {
	return {
		getTree: () => opts.roots,
		getLeafId: () => opts.leafId,
		getLabel: (_id: string) => undefined as string | undefined,
	};
}

function fakeAgentSession(piRoots: unknown[], leafId: string | null) {
	return {
		sessionManager: fakeSessionManager({ roots: piRoots, leafId }),
		navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
		fork: vi.fn().mockResolvedValue({ cancelled: false }),
	};
}

describe("BranchService.getTree", () => {
	it("returns the projected snapshot for the requested session", async () => {
		const u1 = {
			entry: {
				id: "e1",
				parentId: null,
				type: "session_message",
				role: "user",
				text: "hello",
				timestamp: "2026-05-12T00:00:00Z",
			},
			children: [],
		};
		const ags = fakeAgentSession([u1], "e1");
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "c1",
					cwd: "/tmp",
					sessionFilePath: "/tmp/s.jsonl",
					label: "Session A",
				}),
			} as never,
			emitEvent: vi.fn(),
		});
		const snap = await svc.getTree("s1");
		expect(snap.sessionId).toBe("s1");
		expect(snap.leafEntryId).toBe("e1");
		expect(snap.roots).toHaveLength(1);
		expect(snap.hasBranches).toBe(false);
	});

	it("throws not_found when the session is unknown", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => undefined,
			} as never,
			emitEvent: vi.fn(),
		});
		await expect(svc.getTree("missing")).rejects.toThrow(/not found/);
	});
});

describe("BranchService.navigateTree", () => {
	it("calls pi navigateTree with the target entry id", async () => {
		const ags = fakeAgentSession([], null);
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent: vi.fn(),
		});
		await svc.navigateTree("s1", "target-id");
		expect(ags.navigateTree).toHaveBeenCalledWith("target-id");
	});

	it("emits a session.tree event after navigation completes", async () => {
		// pi doesn't fire session_tree on the subscribe() channel — BranchService
		// must synthesize the event itself so renderers know to refetch.
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: vi
					.fn()
					.mockReturnValueOnce("old-leaf")
					.mockReturnValueOnce("new-leaf"),
				getLabel: () => undefined,
			},
			navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
		};
		const emitEvent = vi.fn();
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent,
		});
		await svc.navigateTree("s1", "target-id");
		expect(emitEvent).toHaveBeenCalledWith({
			type: "session.tree",
			piSessionId: "s1",
			newLeafEntryId: "new-leaf",
			oldLeafEntryId: "old-leaf",
		});
	});

	it("throws not_found for unknown session", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent: vi.fn(),
		});
		await expect(svc.navigateTree("missing", "x")).rejects.toThrow(/not found/);
	});
});

describe("BranchService.setEntryLabel", () => {
	it("appends a label change on the session manager", async () => {
		const appendLabelChange = vi.fn().mockReturnValue("label-entry-id");
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				appendLabelChange,
			},
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent: vi.fn(),
		});
		await svc.setEntryLabel("s1", "target", "refactor try");
		expect(appendLabelChange).toHaveBeenCalledWith("target", "refactor try");
	});

	it("passes undefined when label is empty string (clear)", async () => {
		const appendLabelChange = vi.fn().mockReturnValue("label-entry-id");
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				appendLabelChange,
			},
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent: vi.fn(),
		});
		await svc.setEntryLabel("s1", "target", "");
		expect(appendLabelChange).toHaveBeenCalledWith("target", undefined);
	});
});

describe("BranchService.fork", () => {
	it("forks via pi and attaches the new pi session to the parent's channel", async () => {
		// pi's fork(entry) advances internal state; the new pi session id is the
		// session id we observe AFTER fork. The pi SDK's fork() resolves once the
		// new session file is in place; we read getSessionId() from the same
		// AgentSession instance (which has been switched onto the new file).
		const getSessionId = vi
			.fn()
			.mockReturnValueOnce("new-s")
			.mockReturnValue("new-s");
		const getSessionFile = vi.fn().mockReturnValue("/tmp/new-s.jsonl");
		const fork = vi.fn().mockResolvedValue({ cancelled: false });
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				getSessionId,
				getSessionFile,
			},
			fork,
		};
		const attach = vi.fn();
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "channel-1",
					cwd: "/work",
					sessionFilePath: "/tmp/old.jsonl",
					label: "Parent",
				}),
			} as never,
			emitEvent: vi.fn(),
		});
		const result = await svc.fork("s1", "entry-42", "at");
		expect(fork).toHaveBeenCalledWith("entry-42", { position: "at" });
		expect(attach).toHaveBeenCalledWith({
			channelId: "channel-1",
			piSessionId: "new-s",
			cwd: "/work",
			sessionFilePath: "/tmp/new-s.jsonl",
			parentPiSessionId: "s1",
			label: "Parent · new-s",
			labelUserSet: true,
		});
		expect(result).toEqual({ newSessionId: "new-s" });
	});

	it("throws fork_cancelled if pi returns cancelled", async () => {
		const ags = {
			sessionManager: {
				getTree: () => [],
				getLeafId: () => null,
				getLabel: () => undefined,
				getSessionId: () => "x",
				getSessionFile: () => "/x",
			},
			fork: vi.fn().mockResolvedValue({ cancelled: true }),
		};
		const svc = new BranchService({
			getAgentSession: () => ags as never,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: {
				getActiveSessionMeta: () => ({
					channelId: "c",
					cwd: null,
					sessionFilePath: null,
					label: null,
				}),
			} as never,
			emitEvent: vi.fn(),
		});
		await expect(svc.fork("s1", "e1")).rejects.toThrow(/cancelled/);
	});

	it("throws not_found if the session is unknown", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
			emitEvent: vi.fn(),
		});
		await expect(svc.fork("missing", "x")).rejects.toThrow(/not found/);
	});
});
