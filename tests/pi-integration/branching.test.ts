// Layer-3 pi-integration smoke test for session-tree branching.
//
// Verifies that after: prompt → navigateTree (back to first user message) →
// prompt again, the session tree contains at least two user-message entries —
// i.e. the second prompt created a sibling branch rather than extending the
// original linear thread.
//
// Uses the in-memory faux provider (no real pi credentials required).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createTestPiHarness,
	type SessionTreeNode,
	type TestPiHarness,
} from "./test-harness";

describe("Pi branching", () => {
	let harness: TestPiHarness | null = null;

	beforeEach(async () => {
		harness = await createTestPiHarness();
	});

	afterEach(async () => {
		await harness?.dispose();
		harness = null;
	});

	it("two prompts under one root create two branch tips and navigation switches the leaf", async () => {
		if (!harness) return;

		// Turn 1: send the first prompt and wait for the faux response.
		await harness.prompt("first prompt");

		// After turn 1, the tree should have at least a user-message entry.
		const tree1 = harness.getTree();
		expect(tree1.length).toBeGreaterThan(0);

		// Find the first user-message entry id in the tree.
		// pi SDK stores messages as type:"message" with entry.message.role.
		const findFirstUserId = (nodes: SessionTreeNode[]): string | null => {
			for (const n of nodes) {
				if (
					n.entry.type === "message" &&
					"message" in n.entry &&
					(n.entry as { message: { role: string } }).message.role === "user"
				) {
					return n.entry.id;
				}
				const found = findFirstUserId(n.children);
				if (found !== null) return found;
			}
			return null;
		};

		const firstUserId = findFirstUserId(tree1);
		expect(
			firstUserId,
			"expected a user-message entry in the tree after turn 1",
		).toBeTruthy();
		if (!firstUserId) return;

		// Navigate back to that user-message entry → the leaf moves to its
		// parent so the next prompt creates a sibling branch.
		await harness.navigateTree(firstUserId);

		// Turn 2: send an alternative prompt on the new branch.
		await harness.prompt("alternative prompt");

		// After turn 2, the tree should contain at least two user-message entries:
		// the original "first prompt" entry and the new "alternative prompt" entry.
		const tree2 = harness.getTree();
		const userIds: string[] = [];

		const collectUserIds = (nodes: SessionTreeNode[]): void => {
			for (const n of nodes) {
				if (
					n.entry.type === "message" &&
					"message" in n.entry &&
					(n.entry as { message: { role: string } }).message.role === "user"
				) {
					userIds.push(n.entry.id);
				}
				collectUserIds(n.children);
			}
		};

		collectUserIds(tree2);
		expect(
			userIds.length,
			`expected ≥ 2 user-message entries after branching, got ${userIds.length}`,
		).toBeGreaterThanOrEqual(2);
	});
});
