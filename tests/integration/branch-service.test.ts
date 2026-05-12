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
