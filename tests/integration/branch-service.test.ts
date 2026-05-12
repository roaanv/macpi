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
		});
		await svc.navigateTree("s1", "target-id");
		expect(ags.navigateTree).toHaveBeenCalledWith("target-id");
	});

	it("throws not_found for unknown session", async () => {
		const svc = new BranchService({
			getAgentSession: () => undefined,
			channelSessions: { attach: vi.fn() } as never,
			piSessionManager: { getActiveSessionMeta: () => undefined } as never,
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
		});
		await svc.setEntryLabel("s1", "target", "");
		expect(appendLabelChange).toHaveBeenCalledWith("target", undefined);
	});
});
