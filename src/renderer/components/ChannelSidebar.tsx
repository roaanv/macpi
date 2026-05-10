// Left sidebar showing channels and sessions within the selected channel.
// Provides inline forms for creating channels and launching new sessions.

import React from "react";
import {
	useChannels,
	useCreateChannel,
	useCreateSession,
	useSessionsForChannel,
} from "../queries";

export function ChannelSidebar({
	selectedChannelId,
	selectedSessionId,
	onSelectChannel,
	onSelectSession,
}: {
	selectedChannelId: string | null;
	selectedSessionId: string | null;
	onSelectChannel: (id: string) => void;
	onSelectSession: (id: string) => void;
}) {
	const channels = useChannels();
	const createChannel = useCreateChannel();
	const createSession = useCreateSession();
	const sessions = useSessionsForChannel(selectedChannelId);
	const [newName, setNewName] = React.useState("");

	return (
		<div className="flex w-60 flex-col gap-1 bg-[#26262b] p-3 text-sm text-zinc-200">
			<div className="mb-1 text-[10px] uppercase tracking-widest text-zinc-500">
				Channels
			</div>
			{channels.data?.channels.map((c) => (
				<button
					key={c.id}
					type="button"
					onClick={() => onSelectChannel(c.id)}
					className={`rounded px-2 py-1 text-left ${
						selectedChannelId === c.id
							? "bg-zinc-700 text-white"
							: "text-zinc-400 hover:bg-zinc-800"
					}`}
				>
					# {c.name}
				</button>
			))}
			<form
				className="mt-2 flex gap-1"
				onSubmit={(e) => {
					e.preventDefault();
					if (!newName.trim()) return;
					createChannel.mutate({ name: newName.trim() });
					setNewName("");
				}}
			>
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
						<button
							key={id}
							type="button"
							onClick={() => onSelectSession(id)}
							className={`rounded px-2 py-1 text-left text-xs ${
								selectedSessionId === id
									? "bg-zinc-700 text-white"
									: "text-zinc-400 hover:bg-zinc-800"
							}`}
							title={id}
						>
							▸ {id.slice(0, 8)}
						</button>
					))}
					<button
						type="button"
						disabled={createSession.isPending}
						onClick={() =>
							createSession.mutate({
								channelId: selectedChannelId,
								cwd: "/Users/roaanv/mycode/macpi",
							})
						}
						className="mt-2 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
					>
						{createSession.isPending
							? "creating…"
							: "+ new session (cwd: macpi)"}
					</button>
					{createSession.error && (
						<div
							className="mt-1 rounded bg-red-900/40 px-2 py-1 text-[11px] text-red-200"
							title={String(createSession.error)}
						>
							session.create failed: {createSession.error.message}
						</div>
					)}
				</>
			)}
		</div>
	);
}
