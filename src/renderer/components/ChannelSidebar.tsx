// Left sidebar: channels (with hover ⋮ menu + right-click for new session)
// and sessions in the selected channel. Channel + session creation
// happens via dialogs hosted in App.tsx.

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
import { SessionBranches } from "./SessionBranches";
import { SessionRow } from "./SessionRow";

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

	return (
		<div className="flex w-60 flex-col gap-1 surface-panel p-3 text-[length:var(--font-size-sidebar)] text-primary">
			<div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
				<span>Channels</span>
				<button
					type="button"
					onClick={onOpenCreateChannel}
					title="New channel"
					aria-label="New channel"
					className="rounded surface-row px-1.5 text-xs hover:opacity-80"
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
								? "surface-row text-white"
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
							# {c.name}
						</button>
						<RowMenu items={channelMenuItems(c.id, c.name)} />
					</div>
				),
			)}

			{selectedChannelId && (
				<>
					<div className="mt-3 text-[10px] uppercase tracking-widest text-muted">
						Sessions
					</div>
					{sessions.data?.piSessionIds.map((id) => (
						<React.Fragment key={id}>
							<SessionRow
								piSessionId={id}
								selected={selectedSessionId === id}
								onSelect={() => onSelectSession(id)}
								onRename={(label) =>
									renameSession.mutate({ piSessionId: id, label })
								}
								onRequestDelete={() =>
									setConfirmSessionDelete({ piSessionId: id })
								}
							/>
							{selectedSessionId === id && (
								<SessionBranches
									piSessionId={id}
									onForkNavigate={onSelectSession}
								/>
							)}
						</React.Fragment>
					))}
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
