// Left sidebar showing channels and sessions within the selected channel.
// Per-row hover-revealed ⋮ menus expose Rename and Delete. New session
// creation lives in NewSessionForm (cwd picker).

import React from "react";
import { IpcError } from "../ipc";
import {
	useChannels,
	useCreateChannel,
	useCreateSession,
	useDeleteChannel,
	useDeleteSession,
	useRenameChannel,
	useRenameSession,
	useSessionsForChannel,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewSessionForm } from "./NewSessionForm";
import { RowMenu } from "./RowMenu";
import { SessionRow } from "./SessionRow";

export function ChannelSidebar({
	selectedChannelId,
	selectedSessionId,
	onSelectChannel,
	onSelectSession,
}: {
	selectedChannelId: string | null;
	selectedSessionId: string | null;
	onSelectChannel: (id: string | null) => void;
	onSelectSession: (id: string | null) => void;
}) {
	const channels = useChannels();
	const createChannel = useCreateChannel();
	const renameChannel = useRenameChannel();
	const deleteChannel = useDeleteChannel();
	const createSession = useCreateSession();
	const renameSession = useRenameSession();
	const deleteSession = useDeleteSession();
	const sessions = useSessionsForChannel(selectedChannelId);

	const [newName, setNewName] = React.useState("");
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

	const handleCreateChannel = async (e: React.FormEvent) => {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		const result = await createChannel.mutateAsync({ name });
		setNewName("");
		onSelectChannel(result.id);
	};

	const handleCreateSession = async (cwd: string) => {
		if (!selectedChannelId) return;
		const result = await createSession.mutateAsync({
			channelId: selectedChannelId,
			cwd,
		});
		onSelectSession(result.piSessionId);
	};

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

	return (
		<div className="flex w-60 flex-col gap-1 bg-[#26262b] p-3 text-sm text-zinc-200">
			<div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
				Channels
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
						className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 outline-none"
					/>
				) : (
					<div
						key={c.id}
						className={`group flex items-center gap-1 rounded ${
							selectedChannelId === c.id
								? "bg-zinc-700 text-white"
								: "text-zinc-400 hover:bg-zinc-800"
						}`}
					>
						<button
							type="button"
							onClick={() => onSelectChannel(c.id)}
							className="flex-1 px-2 py-1 text-left"
						>
							# {c.name}
						</button>
						<RowMenu
							items={[
								{
									label: "Rename",
									onClick: () => {
										setEditingChannelDraft(c.name);
										setEditingChannelId(c.id);
									},
								},
								{
									label: "Delete",
									destructive: true,
									onClick: () => handleRequestDeleteChannel(c.id, c.name),
								},
							]}
						/>
					</div>
				),
			)}
			<form className="mt-2 flex gap-1" onSubmit={handleCreateChannel}>
				<input
					className="flex-1 rounded bg-zinc-800 px-2 py-1 text-zinc-200 placeholder-zinc-500 outline-none"
					placeholder="new channel"
					value={newName}
					onChange={(e) => setNewName(e.target.value)}
				/>
				<button
					type="submit"
					className="rounded bg-zinc-700 px-2 hover:bg-zinc-600"
				>
					+
				</button>
			</form>

			{selectedChannelId && (
				<>
					<div className="mt-3 text-[10px] uppercase tracking-widest text-zinc-500">
						Sessions
					</div>
					{sessions.data?.piSessionIds.map((id) => (
						<SessionRow
							key={id}
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
					))}
					<NewSessionForm
						pending={createSession.isPending}
						error={createSession.error ? createSession.error.message : null}
						onSubmit={handleCreateSession}
					/>
				</>
			)}

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
