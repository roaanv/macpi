// Unit tests for the pure tree-projection function that converts pi's
// SessionTreeNode[] + leafId into a renderer-safe BranchTreeSnapshot.

import { describe, expect, it } from "vitest";
import { projectTree } from "../../src/main/tree-projection";

type PiNodeFixture = {
	entry: {
		id: string;
		parentId: string | null;
		type: string;
		role?: string;
		summary?: string;
		timestamp?: string;
		text?: string;
	};
	label?: string;
	children: PiNodeFixture[];
};

function userMsg(
	id: string,
	parentId: string | null,
	text = `msg ${id}`,
): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "session_message",
			role: "user",
			timestamp: "2026-05-12T00:00:00Z",
			text,
		},
		children: [],
	};
}

function asstMsg(id: string, parentId: string): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "session_message",
			role: "assistant",
			timestamp: "2026-05-12T00:00:00Z",
		},
		children: [],
	};
}

function summary(
	id: string,
	parentId: string,
	text = "abandoned",
): PiNodeFixture {
	return {
		entry: {
			id,
			parentId,
			type: "branch_summary",
			summary: text,
			timestamp: "2026-05-12T00:00:00Z",
		},
		children: [],
	};
}

function withChildren(
	node: PiNodeFixture,
	children: PiNodeFixture[],
): PiNodeFixture {
	node.children = children;
	return node;
}

function findEntry(
	nodes: {
		entryId: string;
		children: { entryId: string; children: unknown[] }[];
	}[],
	id: string,
):
	| { entryId: string; isLeafTip: boolean; isOnActivePath: boolean }
	| undefined {
	for (const n of nodes) {
		if (n.entryId === id) return n as never;
		const found = findEntry(n.children as never, id);
		if (found) return found;
	}
	return undefined;
}

describe("projectTree", () => {
	it("linear session has no branches", () => {
		const u1 = userMsg("e1", null, "hello");
		const a1 = asstMsg("e2", "e1");
		const u2 = userMsg("e3", "e2", "follow up");
		withChildren(u1, [withChildren(a1, [u2])]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e3",
		});

		expect(snap.hasBranches).toBe(false);
		expect(snap.roots).toHaveLength(1);
		expect(snap.roots[0].entryId).toBe("e1");
		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].entryId).toBe("e3");
		expect(snap.roots[0].children[0].isLeafTip).toBe(true);
		expect(snap.roots[0].children[0].messageCount).toBe(2);
		expect(snap.roots[0].isOnActivePath).toBe(true);
		expect(snap.roots[0].children[0].isOnActivePath).toBe(true);
		expect(snap.activeBranchLabel).toBeUndefined();
	});

	it("single fork has hasBranches=true and two tips", () => {
		// root u1 -> [u2a (active), u2b]
		const u1 = userMsg("e1", null, "start");
		const u2a = userMsg("e2", "e1", "path A");
		const u2b = userMsg("e3", "e1", "path B");
		withChildren(u1, [u2a, u2b]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		expect(snap.hasBranches).toBe(true);
		expect(snap.roots[0].isBranchPoint).toBe(true);
		expect(snap.roots[0].children.map((c) => c.entryId).sort()).toEqual([
			"e2",
			"e3",
		]);
		const active = snap.roots[0].children.find((c) => c.entryId === "e2");
		const inactive = snap.roots[0].children.find((c) => c.entryId === "e3");
		expect(active?.isOnActivePath).toBe(true);
		expect(inactive?.isOnActivePath).toBe(false);
		expect(snap.activeBranchLabel).toBe("path A");
	});

	it("multi-level branching", () => {
		// u1 -> u2 -> [u3a (active), u3b -> u4]
		const u1 = userMsg("e1", null, "root");
		const u2 = userMsg("e2", "e1", "mid");
		const u3a = userMsg("e3", "e2", "A");
		const u3b = userMsg("e4", "e2", "B");
		const u4 = userMsg("e5", "e4", "B-deep");
		withChildren(u3b, [u4]);
		withChildren(u2, [u3a, u3b]);
		withChildren(u1, [u2]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e3",
		});

		expect(snap.hasBranches).toBe(true);
		expect(snap.roots[0].children[0].isBranchPoint).toBe(true);
		const a = snap.roots[0].children[0].children.find(
			(c) => c.entryId === "e3",
		);
		const b = snap.roots[0].children[0].children.find(
			(c) => c.entryId === "e4",
		);
		expect(a?.isLeafTip).toBe(true);
		expect(b?.isLeafTip).toBe(false);
		expect(b?.children[0].entryId).toBe("e5");
		expect(b?.children[0].isLeafTip).toBe(true);
		expect(b?.children[0].messageCount).toBe(2); // e4, e5 on B path from divergence
	});

	it("assistant messages and pass-through entries are folded into edges", () => {
		// u1 -> assistant -> model_change -> u2  (assistant + model_change disappear)
		const u1 = userMsg("e1", null, "hi");
		const ast = asstMsg("e2", "e1");
		const mc: PiNodeFixture = {
			entry: {
				id: "e3",
				parentId: "e2",
				type: "model_change",
				timestamp: "2026-05-12T00:00:00Z",
			},
			children: [],
		};
		const u2 = userMsg("e4", "e3", "next");
		withChildren(mc, [u2]);
		withChildren(ast, [mc]);
		withChildren(u1, [ast]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e4",
		});

		expect(snap.roots[0].entryId).toBe("e1");
		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].entryId).toBe("e4");
	});

	it("branch_summary entries are projected with kind 'branch_summary'", () => {
		const u1 = userMsg("e1", null, "root");
		const s = summary("e2", "e1", "abandoned branch summary");
		withChildren(u1, [s]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e1",
		});

		expect(snap.roots[0].children).toHaveLength(1);
		expect(snap.roots[0].children[0].kind).toBe("branch_summary");
		expect(snap.roots[0].children[0].summary).toBe("abandoned branch summary");
	});

	it("multiple pi roots get a virtual root inserted", () => {
		const a = userMsg("a1", null, "first orphan");
		const b = userMsg("b1", null, "second orphan");
		const snap = projectTree({
			piSessionId: "s1",
			roots: [a, b],
			leafId: "b1",
		});

		expect(snap.roots).toHaveLength(1);
		expect(snap.roots[0].kind).toBe("root");
		expect(snap.roots[0].children).toHaveLength(2);
	});

	it("default label = truncated divergence-point user message (32 chars max)", () => {
		const u1 = userMsg("e1", null, "hi");
		const long = userMsg(
			"e2",
			"e1",
			"this is an extremely long user message that should definitely be truncated",
		);
		const other = userMsg("e3", "e1", "short");
		withChildren(u1, [long, other]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		const longNode = snap.roots[0].children.find((c) => c.entryId === "e2");
		expect(longNode?.label?.length).toBeLessThanOrEqual(32);
		expect(longNode?.label).toMatch(/^this is an extremely long/);
	});

	it("leafId on a folded entry (post-navigateTree(userMsg)) — effective leaf is nearest displayable ancestor", () => {
		// Real-pi flow: navigateTree(userMessageEntry) sets leafId = userMsg.parentId,
		// which is typically the assistant entry above it (per
		// agent-session.js:2242-2245). The assistant entry is folded out by the
		// projection, so the projected "active position" must be the nearest
		// displayable ancestor — the prior user message.
		//
		// Tree: A(user) -> ast(assistant) -> B(user) -> ast2(assistant) -> C(user)
		// User clicks "Branch here" on B  ->  pi sets leaf = ast (B's parent).
		// Expected projected state: A is the active tip, C is the abandoned tip.
		const A = userMsg("a", null, "A");
		const ast = asstMsg("ast", "a");
		const B = userMsg("b", "ast", "B");
		const ast2 = asstMsg("ast2", "b");
		const C = userMsg("c", "ast2", "C");
		withChildren(ast2, [C]);
		withChildren(B, [ast2]);
		withChildren(ast, [B]);
		withChildren(A, [ast]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [A],
			leafId: "ast", // pi parked the leaf on the assistant above B
		});

		expect(snap.hasBranches).toBe(true);
		const a = findEntry(snap.roots, "a");
		const c = findEntry(snap.roots, "c");
		expect(a?.isLeafTip).toBe(true);
		expect(a?.isOnActivePath).toBe(true);
		expect(c?.isLeafTip).toBe(true);
		expect(c?.isOnActivePath).toBe(false);
	});

	it("active leaf with descendants is a tip; abandoned tail is a sibling tip", () => {
		// Simulates the state right after navigateTree(B) on a linear A->B->C->D
		// session: pi keeps the tail in the tree but the leaf pointer now sits
		// on B. Both B (active) and D (abandoned) must be reachable tips so the
		// user can hop back to the old conversation.
		const u1 = userMsg("e1", null, "A");
		const u2 = userMsg("e2", "e1", "B");
		const u3 = userMsg("e3", "e2", "C");
		const u4 = userMsg("e4", "e3", "D");
		withChildren(u3, [u4]);
		withChildren(u2, [u3]);
		withChildren(u1, [u2]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		expect(snap.hasBranches).toBe(true);
		const b = findEntry(snap.roots, "e2");
		const d = findEntry(snap.roots, "e4");
		expect(b?.isLeafTip).toBe(true);
		expect(b?.isOnActivePath).toBe(true);
		expect(d?.isLeafTip).toBe(true);
		expect(d?.isOnActivePath).toBe(false);
	});

	it("pi-set label wins over default text", () => {
		const u1 = userMsg("e1", null, "root");
		const u2 = userMsg("e2", "e1", "default text");
		u2.label = "refactor try";
		const u3 = userMsg("e3", "e1", "other");
		withChildren(u1, [u2, u3]);

		const snap = projectTree({
			piSessionId: "s1",
			roots: [u1],
			leafId: "e2",
		});

		const labelled = snap.roots[0].children.find((c) => c.entryId === "e2");
		expect(labelled?.label).toBe("refactor try");
	});
});
