// Left sidebar: channels (with hover ⋮ menu + right-click for new session)
// and sessions in the selected channel. Sessions render as a proper tree with
// vertical rails + L-connectors; the active lineage paints in the accent
// colour. Channel + session creation happens via dialogs hosted in App.tsx.

import React from "react";
import { IpcError } from "../ipc";
import {
	useChannels,
	useDeleteChannel,
	useDeleteSession,
	useRenameChannel,
	useRenameSession,
	useSessionsForChannel,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";
import { RowMenu, type RowMenuItem } from "./RowMenu";
import { SessionRow } from "./SessionRow";

interface SessionRef {
	piSessionId: string;
	parentPiSessionId: string | null;
}

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

export function ChannelSidebar({
	selectedChannelId,
	selectedSessionId,
	onSelectChannel,
	onSelectSession,
	onOpenCreateChannel,
	onOpenCreateSession,
}: {
	selectedChannelId: string | null;
	selectedSessionId: string | null;
	onSelectChannel: (id: string | null) => void;
	onSelectSession: (id: string | null) => void;
	onOpenCreateChannel: () => void;
	onOpenCreateSession: (channelId: string) => void;
}) {
	const channels = useChannels();
	const renameChannel = useRenameChannel();
	const deleteChannel = useDeleteChannel();
	const renameSession = useRenameSession();
	const deleteSession = useDeleteSession();
	const sessions = useSessionsForChannel(selectedChannelId);

	const [editingChannelId, setEditingChannelId] = React.useState<string | null>(
		null,
	);
	const [editingChannelDraft, setEditingChannelDraft] = React.useState("");
	const [confirmChannelDelete, setConfirmChannelDelete] = React.useState<{
		id: string;
		name: string;
		count: number;
	} | null>(null);
	const [confirmSessionDelete, setConfirmSessionDelete] = React.useState<{
		piSessionId: string;
	} | null>(null);
	const [channelContextMenu, setChannelContextMenu] = React.useState<{
		channelId: string;
		x: number;
		y: number;
	} | null>(null);

	const handleDeleteChannelForce = async () => {
		if (!confirmChannelDelete) return;
		const id = confirmChannelDelete.id;
		await deleteChannel.mutateAsync({ id, force: true });
		setConfirmChannelDelete(null);
		if (selectedChannelId === id) {
			onSelectChannel(null);
			onSelectSession(null);
		}
	};

	const handleRequestDeleteChannel = async (id: string, name: string) => {
		try {
			await deleteChannel.mutateAsync({ id });
			if (selectedChannelId === id) {
				onSelectChannel(null);
				onSelectSession(null);
			}
		} catch (e) {
			if (e instanceof IpcError && e.code === "non_empty") {
				const m = e.message.match(/(\d+)/);
				const count = m ? Number(m[1]) : 1;
				setConfirmChannelDelete({ id, name, count });
				return;
			}
			throw e;
		}
	};

	const channelMenuItems = (id: string, name: string): RowMenuItem[] => [
		{
			label: "New session…",
			onClick: () => onOpenCreateSession(id),
		},
		{
			label: "Rename",
			onClick: () => {
				setEditingChannelDraft(name);
				setEditingChannelId(id);
			},
		},
		{
			label: "Delete",
			destructive: true,
			onClick: () => handleRequestDeleteChannel(id, name),
		},
	];

	const contextMenuChannel = channelContextMenu
		? channels.data?.channels.find((c) => c.id === channelContextMenu.channelId)
		: null;

	const sessionRows = sessions.data?.sessions ?? [];
	const treeRows = React.useMemo(
		() => flattenForestWithRails(buildSessionForest(sessionRows)),
		[sessionRows],
	);
	const activeLineage = React.useMemo(
		() => computeActiveLineage(sessionRows, selectedSessionId),
		[sessionRows, selectedSessionId],
	);

	return (
		<div className="flex h-full w-full min-w-0 flex-col gap-px surface-panel p-3 text-[length:var(--font-size-sidebar)] text-primary">
			<div className="mb-1 flex items-center justify-between px-2 pt-1 text-[10px] text-faint uppercase tracking-widest">
				<span className="font-semibold">Channels</span>
				<button
					type="button"
					onClick={onOpenCreateChannel}
					title="New channel"
					aria-label="New channel"
					className="rounded px-1.5 text-xs text-muted hover:surface-row hover:text-primary"
				>
					+
				</button>
			</div>
			{channels.data?.channels.map((c) =>
				editingChannelId === c.id ? (
					<input
						key={c.id}
						// biome-ignore lint/a11y/noAutofocus: focus is intentional when entering inline rename mode
						autoFocus
						value={editingChannelDraft}
						onChange={(e) => setEditingChannelDraft(e.target.value)}
						onBlur={() => {
							const name = editingChannelDraft.trim();
							if (name && name !== c.name) {
								renameChannel.mutate({ id: c.id, name });
							}
							setEditingChannelId(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								(e.target as HTMLInputElement).blur();
							} else if (e.key === "Escape") {
								setEditingChannelId(null);
							}
						}}
						className="rounded surface-panel px-2 py-1 text-primary outline-none"
					/>
				) : (
					// biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu the ⋮ button shows; keyboard-accessible via that button
					<div
						key={c.id}
						className={`group flex items-center gap-1 rounded ${
							selectedChannelId === c.id
								? "surface-row-active text-primary"
								: "text-muted hover:surface-row"
						}`}
						title={`# ${c.name}\n${c.cwd ?? "(global default)"}`}
						onContextMenu={(e) => {
							e.preventDefault();
							setChannelContextMenu({
								channelId: c.id,
								x: e.clientX,
								y: e.clientY,
							});
						}}
					>
						<button
							type="button"
							onClick={() => onSelectChannel(c.id)}
							className="flex-1 px-2 py-1 text-left"
						>
							<span
								className={
									selectedChannelId === c.id ? "text-accent" : "text-faint"
								}
							>
								#
							</span>{" "}
							{c.name}
						</button>
						<RowMenu items={channelMenuItems(c.id, c.name)} />
					</div>
				),
			)}

			{selectedChannelId && (
				<>
					<div className="mt-3 flex items-center justify-between px-2 pb-1 text-[10px] text-faint uppercase tracking-widest">
						<span className="font-semibold">Sessions</span>
						{treeRows.length > 0 && (
							<span className="font-medium normal-case tracking-normal">
								{treeRows.length}
							</span>
						)}
					</div>
					{/*
					 * Sessions render at 90% of the channel size so the tree feels
					 * subordinate to its channel — the wrapper sets the base size
					 * once and SessionRow inherits it.
					 */}
					<div
						className="flex flex-col gap-px"
						style={{ fontSize: "calc(var(--font-size-sidebar) * 0.9)" }}
					>
						{treeRows.map(({ node, depth, isLastChild, throughRailDepths }) => (
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
						))}
					</div>
				</>
			)}

			<ContextMenu
				items={
					contextMenuChannel
						? channelMenuItems(contextMenuChannel.id, contextMenuChannel.name)
						: []
				}
				position={
					contextMenuChannel && channelContextMenu
						? { x: channelContextMenu.x, y: channelContextMenu.y }
						: null
				}
				onClose={() => setChannelContextMenu(null)}
			/>
			<ConfirmDialog
				open={!!confirmChannelDelete}
				title="Delete channel?"
				body={
					confirmChannelDelete && (
						<>
							Channel <code>#{confirmChannelDelete.name}</code> has{" "}
							{confirmChannelDelete.count} session(s). Delete the channel and
							all its sessions? Pi's session files on disk are preserved.
						</>
					)
				}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteChannelForce}
				onCancel={() => setConfirmChannelDelete(null)}
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
