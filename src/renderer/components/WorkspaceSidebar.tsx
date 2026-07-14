// Left sidebar: workspaces (with hover ⋮ menu + right-click for new session)
// and sessions in the selected workspace. Sessions render as a proper tree with
// vertical rails + L-connectors; the active lineage paints in the accent
// colour. Workspace + session creation happens via dialogs hosted in App.tsx.

import React from "react";
import { IpcError } from "../ipc";
import {
	useDeleteSession,
	useDeleteWorkspace,
	useRenameSession,
	useRenameWorkspace,
	useSessionsForWorkspace,
	useWorkspaces,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";
import { RowMenu, type RowMenuItem } from "./RowMenu";
import { SessionRow } from "./SessionRow";

interface SessionRef {
	piSessionId: string;
	parentPiSessionId: string | null;
}

// Frozen empty fallback so `useMemo` deps stay referentially stable while the
// session query is loading; otherwise the `?? []` fallback below allocates a
// new array each render and forces the tree to rebuild every time.
const EMPTY_SESSIONS: readonly SessionRef[] = Object.freeze([]);

interface SessionTreeNode {
	piSessionId: string;
	parentPiSessionId: string | null;
	depth: number;
	children: SessionTreeNode[];
}

function buildSessionForest(rows: readonly SessionRef[]): SessionTreeNode[] {
	const byId = new Map<string, SessionTreeNode>();
	for (const r of rows) {
		byId.set(r.piSessionId, {
			piSessionId: r.piSessionId,
			parentPiSessionId: r.parentPiSessionId,
			depth: 0,
			children: [],
		});
	}
	const roots: SessionTreeNode[] = [];
	for (const r of rows) {
		const node = byId.get(r.piSessionId);
		if (!node) continue;
		const parent = r.parentPiSessionId
			? byId.get(r.parentPiSessionId)
			: undefined;
		if (parent) {
			node.depth = parent.depth + 1;
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}
	// Re-walk to fix depth for nodes whose parent appeared after them in input.
	const walk = (n: SessionTreeNode, depth: number) => {
		n.depth = depth;
		for (const c of n.children) walk(c, depth + 1);
	};
	for (const r of roots) walk(r, 0);
	return roots;
}

interface FlatTreeRow {
	node: SessionTreeNode;
	depth: number;
	isLastChild: boolean;
	// Depths < depth where an ancestor still has a later sibling.
	throughRailDepths: number[];
}

function flattenForestWithRails(roots: SessionTreeNode[]): FlatTreeRow[] {
	const out: FlatTreeRow[] = [];
	// Stack of booleans: for each ancestor depth, true if it has a later
	// sibling at that depth (i.e. we still need a through-rail).
	const ancestorHasLaterSibling: boolean[] = [];

	const visitSiblings = (siblings: SessionTreeNode[]) => {
		siblings.forEach((node, i) => {
			const isLast = i === siblings.length - 1;
			const throughRailDepths: number[] = [];
			for (let d = 0; d < node.depth; d++) {
				if (ancestorHasLaterSibling[d]) throughRailDepths.push(d);
			}
			out.push({
				node,
				depth: node.depth,
				isLastChild: isLast,
				throughRailDepths,
			});
			ancestorHasLaterSibling[node.depth] = !isLast;
			visitSiblings(node.children);
			// Pop our entry so siblings of our parent see only their own state.
			ancestorHasLaterSibling.length = node.depth;
		});
	};
	visitSiblings(roots);
	return out;
}

function computeActiveLineage(
	rows: readonly SessionRef[],
	selectedId: string | null,
): Set<string> {
	const out = new Set<string>();
	if (!selectedId) return out;
	const byId = new Map<string, SessionRef>();
	for (const r of rows) byId.set(r.piSessionId, r);
	let cur = byId.get(selectedId);
	while (cur) {
		out.add(cur.piSessionId);
		cur = cur.parentPiSessionId ? byId.get(cur.parentPiSessionId) : undefined;
	}
	return out;
}

export function WorkspaceSidebar({
	selectedWorkspaceId,
	selectedSessionId,
	onSelectWorkspace,
	onSelectSession,
	onOpenCreateWorkspace,
	onOpenCreateSession,
}: {
	selectedWorkspaceId: string | null;
	selectedSessionId: string | null;
	onSelectWorkspace: (id: string | null) => void;
	onSelectSession: (id: string | null) => void;
	onOpenCreateWorkspace: () => void;
	onOpenCreateSession: (workspaceId: string) => void;
}) {
	const workspaces = useWorkspaces();
	const renameWorkspace = useRenameWorkspace();
	const deleteWorkspace = useDeleteWorkspace();
	const renameSession = useRenameSession();
	const deleteSession = useDeleteSession();
	const sessions = useSessionsForWorkspace(selectedWorkspaceId);

	const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<
		string | null
	>(null);
	const [editingWorkspaceDraft, setEditingWorkspaceDraft] = React.useState("");
	const [confirmWorkspaceDelete, setConfirmWorkspaceDelete] = React.useState<{
		id: string;
		name: string;
		count: number;
	} | null>(null);
	const [confirmSessionDelete, setConfirmSessionDelete] = React.useState<{
		piSessionId: string;
	} | null>(null);
	const [workspaceContextMenu, setWorkspaceContextMenu] = React.useState<{
		workspaceId: string;
		x: number;
		y: number;
	} | null>(null);

	const handleDeleteWorkspaceForce = async () => {
		if (!confirmWorkspaceDelete) return;
		const id = confirmWorkspaceDelete.id;
		await deleteWorkspace.mutateAsync({ id, force: true });
		setConfirmWorkspaceDelete(null);
		if (selectedWorkspaceId === id) {
			onSelectWorkspace(null);
			onSelectSession(null);
		}
	};

	const handleRequestDeleteWorkspace = async (id: string, name: string) => {
		try {
			await deleteWorkspace.mutateAsync({ id });
			if (selectedWorkspaceId === id) {
				onSelectWorkspace(null);
				onSelectSession(null);
			}
		} catch (e) {
			if (e instanceof IpcError && e.code === "non_empty") {
				const m = e.message.match(/(\d+)/);
				const count = m ? Number(m[1]) : 1;
				setConfirmWorkspaceDelete({ id, name, count });
				return;
			}
			throw e;
		}
	};

	const workspaceMenuItems = (id: string, name: string): RowMenuItem[] => [
		{
			label: "New session…",
			onClick: () => onOpenCreateSession(id),
		},
		{
			label: "Rename",
			onClick: () => {
				setEditingWorkspaceDraft(name);
				setEditingWorkspaceId(id);
			},
		},
		{
			label: "Delete",
			destructive: true,
			onClick: () => handleRequestDeleteWorkspace(id, name),
		},
	];

	const contextMenuWorkspace = workspaceContextMenu
		? workspaces.data?.workspaces.find(
				(workspace) => workspace.id === workspaceContextMenu.workspaceId,
			)
		: null;

	const sessionRows: readonly SessionRef[] =
		sessions.data?.sessions ?? EMPTY_SESSIONS;
	const workspaceTreeRows = React.useMemo(
		() => flattenForestWithRails(buildSessionForest(sessionRows)),
		[sessionRows],
	);
	const activeLineage = React.useMemo(
		() => computeActiveLineage(sessionRows, selectedSessionId),
		[sessionRows, selectedSessionId],
	);

	return (
		<div className="flex h-full w-full min-w-0 flex-col gap-px surface-panel p-3 type-compact text-primary">
			<div className="mb-1 flex items-center justify-between px-2 pt-1">
				<span className="type-overline">Workspaces</span>
				<button
					type="button"
					onClick={onOpenCreateWorkspace}
					title="New workspace"
					aria-label="New workspace"
					className="rounded px-1.5 type-control type-compact text-muted hover:surface-row hover:text-primary"
				>
					+
				</button>
			</div>
			{workspaces.data?.workspaces.map((workspace) =>
				editingWorkspaceId === workspace.id ? (
					<input
						key={workspace.id}
						// biome-ignore lint/a11y/noAutofocus: focus is intentional when entering inline rename mode
						autoFocus
						value={editingWorkspaceDraft}
						onChange={(e) => setEditingWorkspaceDraft(e.target.value)}
						onBlur={() => {
							const name = editingWorkspaceDraft.trim();
							if (name && name !== workspace.name) {
								renameWorkspace.mutate({ id: workspace.id, name });
							}
							setEditingWorkspaceId(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								(e.target as HTMLInputElement).blur();
							} else if (e.key === "Escape") {
								setEditingWorkspaceId(null);
							}
						}}
						className="min-w-0 rounded surface-panel px-2 py-1 type-control type-compact text-primary outline-none"
					/>
				) : (
					// biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu the ⋮ button shows; keyboard-accessible via that button
					<div
						key={workspace.id}
						className={`group flex items-center gap-1 rounded ${
							selectedWorkspaceId === workspace.id
								? "surface-row-active text-primary"
								: "text-muted hover:surface-row"
						}`}
						title={`# ${workspace.name}\n${workspace.cwd ?? "(global default)"}`}
						onContextMenu={(e) => {
							e.preventDefault();
							setWorkspaceContextMenu({
								workspaceId: workspace.id,
								x: e.clientX,
								y: e.clientY,
							});
						}}
					>
						<button
							type="button"
							onClick={() => onSelectWorkspace(workspace.id)}
							className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left"
						>
							<span
								className={
									selectedWorkspaceId === workspace.id
										? "shrink-0 text-accent"
										: "shrink-0 text-faint"
								}
							>
								#
							</span>
							<span className="min-w-0 type-label type-compact type-ellipsis">
								{workspace.name}
							</span>
						</button>
						<RowMenu items={workspaceMenuItems(workspace.id, workspace.name)} />
					</div>
				),
			)}

			{selectedWorkspaceId && (
				<>
					<div className="mt-3 flex items-center justify-between px-2 pb-1">
						<span className="type-overline">Sessions</span>
						{workspaceTreeRows.length > 0 && (
							<span className="type-metadata type-tabular">
								{workspaceTreeRows.length}
							</span>
						)}
					</div>
					<div className="flex flex-col gap-px">
						{workspaceTreeRows.map(
							({ node, depth, isLastChild, throughRailDepths }) => (
								<SessionRow
									key={node.piSessionId}
									piSessionId={node.piSessionId}
									selected={selectedSessionId === node.piSessionId}
									depth={depth}
									throughRailDepths={throughRailDepths}
									isLastChild={isLastChild}
									onActiveLineage={activeLineage.has(node.piSessionId)}
									onSelect={() => onSelectSession(node.piSessionId)}
									onRename={(label) =>
										renameSession.mutate({
											piSessionId: node.piSessionId,
											label,
										})
									}
									onRequestDelete={() =>
										setConfirmSessionDelete({ piSessionId: node.piSessionId })
									}
								/>
							),
						)}
					</div>
				</>
			)}

			<ContextMenu
				items={
					contextMenuWorkspace
						? workspaceMenuItems(
								contextMenuWorkspace.id,
								contextMenuWorkspace.name,
							)
						: []
				}
				position={
					contextMenuWorkspace && workspaceContextMenu
						? { x: workspaceContextMenu.x, y: workspaceContextMenu.y }
						: null
				}
				onClose={() => setWorkspaceContextMenu(null)}
			/>
			<ConfirmDialog
				open={!!confirmWorkspaceDelete}
				title="Delete workspace?"
				body={
					confirmWorkspaceDelete && (
						<>
							Workspace <code>#{confirmWorkspaceDelete.name}</code> has{" "}
							{confirmWorkspaceDelete.count} session(s). Delete the workspace
							and all its sessions? Pi's session files on disk are preserved.
						</>
					)
				}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteWorkspaceForce}
				onCancel={() => setConfirmWorkspaceDelete(null)}
			/>
			<ConfirmDialog
				open={!!confirmSessionDelete}
				title="Delete session?"
				body="This removes the session from the sidebar. Pi's session file on disk is preserved."
				confirmLabel="Delete"
				destructive
				onConfirm={async () => {
					if (!confirmSessionDelete) return;
					const id = confirmSessionDelete.piSessionId;
					await deleteSession.mutateAsync({ piSessionId: id });
					if (selectedSessionId === id) onSelectSession(null);
					setConfirmSessionDelete(null);
				}}
				onCancel={() => setConfirmSessionDelete(null)}
			/>
		</div>
	);
}

// Exported for tests.
export {
	buildSessionForest,
	computeActiveLineage,
	type FlatTreeRow,
	flattenForestWithRails,
	type SessionTreeNode,
};
