// Unit tests for the session tree rail computation used by ChannelSidebar.
// Verifies forest construction, the depth-first flatten, last-child detection,
// through-rail depth tracking, and active-lineage resolution.

import { describe, expect, it } from "vitest";
import {
	buildSessionForest,
	computeActiveLineage,
	flattenForestWithRails,
} from "../../src/renderer/components/ChannelSidebar";

interface Row {
	piSessionId: string;
	parentPiSessionId: string | null;
}

const rows = (...entries: [string, string | null][]): Row[] =>
	entries.map(([piSessionId, parentPiSessionId]) => ({
		piSessionId,
		parentPiSessionId,
	}));

describe("buildSessionForest", () => {
	it("builds a flat list of roots when no rows have parents", () => {
		const forest = buildSessionForest(rows(["a", null], ["b", null]));
		expect(forest).toHaveLength(2);
		expect(forest.map((n) => n.piSessionId)).toEqual(["a", "b"]);
		for (const n of forest) expect(n.depth).toBe(0);
	});

	it("attaches children to parents and assigns depth via walk", () => {
		const forest = buildSessionForest(
			rows(["a", null], ["b", "a"], ["c", "b"], ["d", "a"]),
		);
		expect(forest).toHaveLength(1);
		const a = forest[0];
		expect(a.depth).toBe(0);
		expect(a.children.map((c) => c.piSessionId)).toEqual(["b", "d"]);
		expect(a.children[0].depth).toBe(1);
		expect(a.children[0].children[0].piSessionId).toBe("c");
		expect(a.children[0].children[0].depth).toBe(2);
	});

	it("re-walks depth so out-of-order rows still resolve correctly", () => {
		// Child appears before parent in the input list.
		const forest = buildSessionForest(rows(["b", "a"], ["a", null]));
		expect(forest).toHaveLength(1);
		expect(forest[0].piSessionId).toBe("a");
		expect(forest[0].children[0].piSessionId).toBe("b");
		expect(forest[0].children[0].depth).toBe(1);
	});
});

describe("flattenForestWithRails", () => {
	it("emits no rails for a flat top-level list", () => {
		const flat = flattenForestWithRails(
			buildSessionForest(rows(["a", null], ["b", null])),
		);
		expect(flat).toHaveLength(2);
		for (const row of flat) {
			expect(row.throughRailDepths).toEqual([]);
			expect(row.depth).toBe(0);
		}
		expect(flat[0].isLastChild).toBe(false);
		expect(flat[1].isLastChild).toBe(true);
	});

	it("marks isLastChild on the terminal sibling at each depth", () => {
		// a — b — c
		//   \— d
		const flat = flattenForestWithRails(
			buildSessionForest(rows(["a", null], ["b", "a"], ["c", "b"], ["d", "a"])),
		);
		const byId = new Map(flat.map((f) => [f.node.piSessionId, f]));
		expect(byId.get("a")?.isLastChild).toBe(true); // single root
		expect(byId.get("b")?.isLastChild).toBe(false); // d is later sibling at depth 1
		expect(byId.get("c")?.isLastChild).toBe(true); // only child of b
		expect(byId.get("d")?.isLastChild).toBe(true); // last child of a
	});

	it("draws a depth-0 through-rail for children of a non-final root", () => {
		// Two roots r1, r2. c1 sits under r1; r1 has a later sibling at
		// depth 0 (namely r2), so c1's rendering needs a vertical through-rail
		// at depth 0 to visually continue the trunk down toward r2. c2 (under
		// the last root) gets no through-rail.
		const flat = flattenForestWithRails(
			buildSessionForest(
				rows(["r1", null], ["c1", "r1"], ["r2", null], ["c2", "r2"]),
			),
		);
		const byId = new Map(flat.map((f) => [f.node.piSessionId, f]));
		expect(byId.get("c1")?.throughRailDepths).toEqual([0]);
		expect(byId.get("c2")?.throughRailDepths).toEqual([]);
		// Roots themselves never have rails (depth 0 loop body never runs).
		expect(byId.get("r1")?.throughRailDepths).toEqual([]);
		expect(byId.get("r2")?.throughRailDepths).toEqual([]);
	});

	it("tracks through-rail depths for ancestors with later siblings", () => {
		// a
		//  ├ b (has later sibling d at depth 1)
		//  │  └ c (depth 2 — needs through-rail at depth 1 because b has d after)
		//  └ d
		//     └ e (depth 2 — no through-rail at depth 1 because d is the last child)
		const flat = flattenForestWithRails(
			buildSessionForest(
				rows(["a", null], ["b", "a"], ["c", "b"], ["d", "a"], ["e", "d"]),
			),
		);
		const byId = new Map(flat.map((f) => [f.node.piSessionId, f]));
		expect(byId.get("c")?.throughRailDepths).toEqual([1]);
		expect(byId.get("e")?.throughRailDepths).toEqual([]);
	});
});

describe("computeActiveLineage", () => {
	it("returns empty when no session is selected", () => {
		expect(computeActiveLineage(rows(["a", null], ["b", "a"]), null)).toEqual(
			new Set(),
		);
	});

	it("walks from selected up through every ancestor", () => {
		const lineage = computeActiveLineage(
			rows(["a", null], ["b", "a"], ["c", "b"]),
			"c",
		);
		expect(lineage).toEqual(new Set(["a", "b", "c"]));
	});

	it("stops at the root and ignores siblings", () => {
		const lineage = computeActiveLineage(
			rows(["a", null], ["b", "a"], ["c", "a"]),
			"b",
		);
		expect(lineage).toEqual(new Set(["a", "b"]));
	});
});
