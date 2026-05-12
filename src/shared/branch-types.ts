// Renderer-safe shapes for pi session-tree branching. Built by tree-projection.ts
// in main from pi's SessionTreeNode[] + leafId, then surfaced over IPC.

export type BranchNodeKind =
	| "user_message" // type:session_message, role:user — the rows we render
	| "branch_summary" // pi's branch_summary entries (informational)
	| "root"; // virtual root used when pi's tree has multiple top-level entries

export interface BranchTreeNode {
	entryId: string;
	kind: BranchNodeKind;
	parentId: string | null;
	label?: string; // user-set label OR truncated divergence-point text
	summary?: string; // pi-generated branch summary text (read-only)
	timestamp: string; // ISO entry creation
	messageCount?: number; // user messages on branch path; only set when isLeafTip
	children: BranchTreeNode[];
	isOnActivePath: boolean;
	isBranchPoint: boolean; // displayable-children > 1
	isLeafTip: boolean; // no displayable children OR matches the active leaf
}

export interface BranchTreeSnapshot {
	sessionId: string; // pi session id
	leafEntryId: string | null;
	roots: BranchTreeNode[];
	hasBranches: boolean; // any node with displayable-children > 1
	activeBranchLabel?: string; // present only when hasBranches === true
}
