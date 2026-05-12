// Right-hand panel that renders the branch/fork tree for the active pi session.
// Receives the active piSessionId and a callback to navigate after a fork.
// Props are optional so the existing App.tsx call site (Task 16 will update)
// continues to compile until the caller is updated.

import {
	useForkSession,
	useNavigateTree,
	useSessionTree,
	useSetEntryLabel,
} from "../queries";
import { BranchTree } from "./BranchTree";

interface BranchPanelProps {
	piSessionId?: string | null;
	onForkNavigate?: (newPiSessionId: string) => void;
}

export function BranchPanel({ piSessionId, onForkNavigate }: BranchPanelProps) {
	const sid = piSessionId ?? null;
	const tree = useSessionTree(sid);
	const navigate = useNavigateTree();
	const fork = useForkSession();
	const rename = useSetEntryLabel();

	if (!sid) {
		return (
			<aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
				<Header count={null} />
				<div className="mt-2">Select a session to see its branches.</div>
			</aside>
		);
	}
	if (tree.isLoading || !tree.data) {
		return (
			<aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
				<Header count={null} />
				<div className="mt-2">Loading…</div>
			</aside>
		);
	}
	const snap = tree.data;
	if (!snap.hasBranches) {
		return (
			<aside className="w-60 surface-panel border-l border-divider p-3 text-xs text-muted">
				<Header count={1} />
				<div className="mt-3 text-faint">
					No branches yet.
					<br />
					Hover any user message in the chat and click
					<span className="text-primary"> ↪ Branch here</span> to fork.
				</div>
			</aside>
		);
	}

	return (
		<aside className="flex w-60 flex-col surface-panel border-l border-divider">
			<div className="p-3 pb-1">
				<Header count={tipCount(snap.roots)} />
			</div>
			<div className="flex-1 overflow-y-auto pb-2">
				<BranchTree
					nodes={snap.roots}
					onSelect={(entryId) => navigate.mutate({ piSessionId: sid, entryId })}
					onRename={(entryId, label) =>
						rename.mutate({ piSessionId: sid, entryId, label })
					}
					onFork={(entryId) =>
						fork.mutate(
							{ piSessionId: sid, entryId, position: "at" },
							{
								onSuccess: (r) => onForkNavigate?.(r.newSessionId),
							},
						)
					}
				/>
			</div>
		</aside>
	);
}

function Header({ count }: { count: number | null }) {
	return (
		<div className="flex items-center justify-between">
			<span className="text-[10px] uppercase tracking-widest text-muted">
				Branches
			</span>
			{count != null && <span className="text-[10px] text-faint">{count}</span>}
		</div>
	);
}

function tipCount(
	nodes: import("../../shared/branch-types").BranchTreeNode[],
): number {
	let n = 0;
	for (const node of nodes) {
		if (node.isLeafTip) n++;
		n += tipCount(node.children);
	}
	return n;
}
