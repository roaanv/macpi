// Pure conversion from pi's SessionTreeNode[] + leafId to renderer-safe
// BranchTreeSnapshot. Folds pass-through entry types (assistant, model_change,
// thinking_level_change, compaction, label, session_info, custom*) into edges;
// surfaces user_message + branch_summary as displayable rows. Adds isOnActivePath /
// isBranchPoint / isLeafTip / messageCount.

import type {
	BranchNodeKind,
	BranchTreeNode,
	BranchTreeSnapshot,
} from "../shared/branch-types";

interface PiSessionEntryLike {
	id: string;
	parentId: string | null;
	type: string;
	role?: string;
	summary?: string;
	timestamp?: string;
	text?: string;
}

interface PiNodeLike {
	entry: PiSessionEntryLike;
	label?: string;
	children: PiNodeLike[];
}

interface ProjectInput {
	piSessionId: string;
	roots: PiNodeLike[];
	leafId: string | null;
}

const LABEL_MAX = 32;

function isDisplayable(entry: PiSessionEntryLike): BranchNodeKind | null {
	if (entry.type === "session_message" && entry.role === "user") {
		return "user_message";
	}
	if (entry.type === "branch_summary") {
		return "branch_summary";
	}
	return null;
}

function defaultLabel(entry: PiSessionEntryLike): string | undefined {
	if (typeof entry.text !== "string" || entry.text.length === 0) {
		return undefined;
	}
	const t = entry.text.trim();
	return t.length <= LABEL_MAX ? t : t.slice(0, LABEL_MAX);
}

interface ProjectionContext {
	activePath: Set<string>;
}

// Walk a pi node + its children, returning the displayable children that
// should be reachable from `inheritedParentId`. Pass-through nodes are skipped
// but their children are flattened up to the nearest displayable ancestor.
function projectChildren(
	piChildren: PiNodeLike[],
	inheritedParentId: string | null,
	ctx: ProjectionContext,
): BranchTreeNode[] {
	const out: BranchTreeNode[] = [];
	for (const c of piChildren) {
		const kind = isDisplayable(c.entry);
		if (kind) {
			out.push(buildNode(c, inheritedParentId, kind, ctx));
		} else {
			// pass-through: flatten this child's children up to inheritedParentId
			out.push(...projectChildren(c.children, inheritedParentId, ctx));
		}
	}
	return out;
}

function buildNode(
	pi: PiNodeLike,
	parentId: string | null,
	kind: BranchNodeKind,
	ctx: ProjectionContext,
): BranchTreeNode {
	const children = projectChildren(pi.children, pi.entry.id, ctx);
	const isBranchPoint = children.length > 1;
	const isLeafTip = children.length === 0;
	const label = pi.label ?? defaultLabel(pi.entry);
	return {
		entryId: pi.entry.id,
		kind,
		parentId,
		label,
		summary: kind === "branch_summary" ? pi.entry.summary : undefined,
		timestamp: pi.entry.timestamp ?? "",
		messageCount: undefined,
		children,
		isOnActivePath: ctx.activePath.has(pi.entry.id),
		isBranchPoint,
		isLeafTip,
	};
}

export function projectTree(input: ProjectInput): BranchTreeSnapshot {
	// Build active-path set from leafId walking up via the entry map.
	const byId = new Map<string, PiNodeLike>();
	const indexNode = (n: PiNodeLike) => {
		byId.set(n.entry.id, n);
		for (const c of n.children) indexNode(c);
	};
	for (const r of input.roots) indexNode(r);

	const activePath = new Set<string>();
	let cur: PiNodeLike | undefined = input.leafId
		? byId.get(input.leafId)
		: undefined;
	while (cur) {
		activePath.add(cur.entry.id);
		const pid = cur.entry.parentId;
		cur = pid ? byId.get(pid) : undefined;
	}

	const ctx: ProjectionContext = { activePath };

	// Project roots: each pi root that is displayable becomes a node; pass-through
	// roots are flattened (children promoted up).
	const projectedRoots: BranchTreeNode[] = [];
	for (const r of input.roots) {
		const kind = isDisplayable(r.entry);
		if (kind) {
			projectedRoots.push(buildNode(r, null, kind, ctx));
		} else {
			projectedRoots.push(...projectChildren(r.children, null, ctx));
		}
	}

	// If pi gave us multiple roots, wrap in a virtual root.
	const roots: BranchTreeNode[] =
		projectedRoots.length > 1
			? [
					{
						entryId: "__root__",
						kind: "root",
						parentId: null,
						timestamp: "",
						children: projectedRoots,
						isOnActivePath: projectedRoots.some((c) => c.isOnActivePath),
						isBranchPoint: projectedRoots.length > 1,
						isLeafTip: false,
					},
				]
			: projectedRoots;

	// Compute messageCount per tip: number of user_message nodes on the path
	// from the nearest branch point (or root) down to this tip.
	const fillMessageCount = (n: BranchTreeNode, runningCount: number): void => {
		if (n.kind === "user_message") {
			const next = runningCount + 1;
			if (n.isLeafTip) {
				n.messageCount = next;
			}
			if (n.isBranchPoint) {
				// reset path-from-divergence count for each child
				for (const c of n.children) fillMessageCount(c, 0);
			} else {
				for (const c of n.children) fillMessageCount(c, next);
			}
		} else {
			for (const c of n.children) fillMessageCount(c, runningCount);
		}
	};
	for (const r of roots) fillMessageCount(r, 0);

	// activeBranchLabel: label of the active leaf tip (if hasBranches).
	const hasBranches = anyHasBranches(roots);
	let activeBranchLabel: string | undefined;
	if (hasBranches && input.leafId) {
		const tip = findById(roots, input.leafId);
		activeBranchLabel = tip?.label;
	}

	return {
		sessionId: input.piSessionId,
		leafEntryId: input.leafId,
		roots,
		hasBranches,
		activeBranchLabel,
	};
}

function anyHasBranches(nodes: BranchTreeNode[]): boolean {
	for (const n of nodes) {
		if (n.isBranchPoint) return true;
		if (anyHasBranches(n.children)) return true;
	}
	return false;
}

function findById(
	nodes: BranchTreeNode[],
	id: string,
): BranchTreeNode | undefined {
	for (const n of nodes) {
		if (n.entryId === id) return n;
		const found = findById(n.children, id);
		if (found) return found;
	}
	return undefined;
}
