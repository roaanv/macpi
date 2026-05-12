import React from "react";
import type { BranchTreeNode } from "../../shared/branch-types";
import { BranchRenameInput } from "./BranchRenameInput";
import { BranchTreeRow } from "./BranchTreeRow";

interface BranchTreeProps {
	nodes: BranchTreeNode[];
	onSelect: (entryId: string) => void;
	onRename: (entryId: string, label: string) => void;
	onFork: (entryId: string) => void;
}

export function BranchTree({
	nodes,
	onSelect,
	onRename,
	onFork,
}: BranchTreeProps) {
	const [renamingId, setRenamingId] = React.useState<string | null>(null);

	const render = (ns: BranchTreeNode[], depth: number): React.ReactNode => {
		return ns.map((n) => (
			<React.Fragment key={n.entryId}>
				<BranchTreeRow
					node={n}
					indent={depth}
					onSelect={onSelect}
					onStartRename={(id) => setRenamingId(id)}
					onFork={onFork}
					renaming={renamingId === n.entryId}
				>
					{renamingId === n.entryId && (
						<BranchRenameInput
							initial={n.label ?? ""}
							onCommit={(label) => {
								setRenamingId(null);
								onRename(n.entryId, label);
							}}
							onCancel={() => setRenamingId(null)}
						/>
					)}
				</BranchTreeRow>
				{n.children.length > 0 && render(n.children, depth + 1)}
			</React.Fragment>
		));
	};

	return <div className="flex flex-col">{render(nodes, 0)}</div>;
}
