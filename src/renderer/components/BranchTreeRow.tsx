import React from "react";
import type { BranchTreeNode } from "../../shared/branch-types";

interface BranchTreeRowProps {
	node: BranchTreeNode;
	indent: number;
	onSelect: (entryId: string) => void;
	onStartRename: (entryId: string) => void;
	onFork: (entryId: string) => void;
	renaming: boolean;
	children?: React.ReactNode; // rename input lives here when renaming
}

export function BranchTreeRow({
	node,
	indent,
	onSelect,
	onStartRename,
	onFork,
	renaming,
	children,
}: BranchTreeRowProps) {
	const [menuOpen, setMenuOpen] = React.useState(false);
	if (node.kind === "branch_summary") {
		return (
			<div
				style={{ paddingLeft: 12 + indent * 16 }}
				className="text-xs italic text-faint truncate"
			>
				· {node.summary ?? "(summary)"}
			</div>
		);
	}
	const isClickable = !node.isOnActivePath && node.isLeafTip;
	return (
		<div
			style={{ paddingLeft: 12 + indent * 16 }}
			className={`group flex items-center gap-1 py-0.5 text-xs ${node.isOnActivePath ? "font-semibold text-primary" : "text-muted"}`}
			role="treeitem"
			tabIndex={0}
			onContextMenu={(e) => {
				if (node.isLeafTip) {
					e.preventDefault();
					setMenuOpen(true);
				}
			}}
		>
			<span aria-hidden="true">
				{node.isLeafTip ? (node.isOnActivePath ? "●" : "○") : "├─"}
			</span>
			{renaming ? (
				children
			) : (
				<button
					type="button"
					disabled={!isClickable}
					onClick={() => {
						if (isClickable) {
							onSelect(node.entryId);
						}
					}}
					className={`flex-1 truncate text-left ${isClickable ? "hover:underline" : ""}`}
				>
					{node.label ?? "(unlabelled)"}
					{node.messageCount != null && (
						<span className="ml-2 text-[10px] text-faint">
							· {node.messageCount} msg
						</span>
					)}
				</button>
			)}
			{node.isLeafTip && !renaming && (
				<button
					type="button"
					onClick={() => onStartRename(node.entryId)}
					className="invisible text-[10px] text-faint group-hover:visible hover:text-primary"
					aria-label="Rename branch"
				>
					✏️
				</button>
			)}
			{menuOpen && (
				<div
					role="menu"
					className="absolute z-10 mt-4 rounded border border-divider surface-panel p-1 text-xs shadow"
				>
					<button
						type="button"
						onClick={() => {
							setMenuOpen(false);
							onFork(node.entryId);
						}}
						className="px-2 py-1 hover:surface-row"
					>
						Fork to new session
					</button>
				</div>
			)}
		</div>
	);
}
