// Inline branch list rendered under the currently-selected session row in
// the channel sidebar. Shows the active session's in-place branch tips
// (pi's navigateTree-style branches, not forked sessions). Click a tip to
// switch the active branch; right-click → fork to a new session file.
//
// Hidden entirely for linear sessions (snapshot.hasBranches === false) to
// keep the sidebar compact.

import React from "react";
import type { BranchTreeNode } from "../../shared/branch-types";
import {
	useForkSession,
	useNavigateTree,
	useSessionTree,
	useSetEntryLabel,
} from "../queries";

interface SessionBranchesProps {
	piSessionId: string;
	onForkNavigate: (newPiSessionId: string) => void;
}

export function SessionBranches({
	piSessionId,
	onForkNavigate,
}: SessionBranchesProps) {
	const tree = useSessionTree(piSessionId);
	if (!tree.data?.hasBranches) return null;
	return (
		<div className="ml-3 border-l border-divider pl-2">
			<TipList
				roots={tree.data.roots}
				piSessionId={piSessionId}
				onForkNavigate={onForkNavigate}
			/>
		</div>
	);
}

interface TipListProps {
	roots: BranchTreeNode[];
	piSessionId: string;
	onForkNavigate: (newPiSessionId: string) => void;
}

function TipList({ roots, piSessionId, onForkNavigate }: TipListProps) {
	// Flatten the projected tree to just its leaf tips for sidebar display.
	// The nested tree structure is interesting in the right panel but in a
	// 240px sidebar it crowds; tips are the actionable rows.
	const tips: BranchTreeNode[] = [];
	const collect = (node: BranchTreeNode) => {
		if (node.isLeafTip && node.kind !== "root") tips.push(node);
		for (const c of node.children) collect(c);
	};
	for (const r of roots) collect(r);

	return (
		<div className="flex flex-col">
			{tips.map((t) => (
				<TipRow
					key={t.entryId}
					node={t}
					piSessionId={piSessionId}
					onForkNavigate={onForkNavigate}
				/>
			))}
		</div>
	);
}

function TipRow({
	node,
	piSessionId,
	onForkNavigate,
}: {
	node: BranchTreeNode;
	piSessionId: string;
	onForkNavigate: (newPiSessionId: string) => void;
}) {
	const navigate = useNavigateTree();
	const fork = useForkSession();
	const rename = useSetEntryLabel();
	const [renaming, setRenaming] = React.useState(false);
	const [draft, setDraft] = React.useState("");

	const handleClick = () => {
		if (node.isOnActivePath) return;
		navigate.mutate({ piSessionId, entryId: node.entryId });
	};

	const handleFork = () => {
		fork.mutate(
			{ piSessionId, entryId: node.entryId, position: "at" },
			{ onSuccess: (r) => onForkNavigate(r.newSessionId) },
		);
	};

	return (
		<div
			className={`group flex items-center gap-1 rounded px-1 py-0.5 text-xs ${
				node.isOnActivePath
					? "font-semibold text-primary"
					: "text-muted hover:surface-row"
			}`}
			onContextMenu={(e) => {
				e.preventDefault();
				handleFork();
			}}
			role="treeitem"
			tabIndex={-1}
			aria-selected={node.isOnActivePath}
			aria-label={`Branch ${node.label ?? "(unlabelled)"}`}
		>
			<span aria-hidden="true">{node.isOnActivePath ? "●" : "○"}</span>
			{renaming ? (
				<input
					// biome-ignore lint/a11y/noAutofocus: focus is intentional when entering rename mode
					autoFocus
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							rename.mutate({
								piSessionId,
								entryId: node.entryId,
								label: draft,
							});
							setRenaming(false);
						} else if (e.key === "Escape") {
							setRenaming(false);
						}
					}}
					onBlur={() => setRenaming(false)}
					className="flex-1 rounded border border-divider bg-transparent px-1 text-xs"
				/>
			) : (
				<button
					type="button"
					onClick={handleClick}
					onDoubleClick={() => {
						setDraft(node.label ?? "");
						setRenaming(true);
					}}
					className="flex-1 truncate text-left"
					title="Click to switch · Double-click to rename · Right-click to fork"
				>
					{node.label ?? "(unlabelled)"}
					{node.messageCount != null && (
						<span className="ml-1 text-[10px] text-faint">
							·{node.messageCount}
						</span>
					)}
				</button>
			)}
		</div>
	);
}
