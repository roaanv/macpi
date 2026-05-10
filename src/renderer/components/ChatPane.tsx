// Main chat area. Subscribes to pi events via useTimeline() and renders the
// resulting timeline. Banners and queue pills are wired in Phase E/F.

import React from "react";
import { usePromptSession } from "../queries";
import { useTimeline } from "../state/timeline-state";
import { CompactionBanner } from "./banners/CompactionBanner";
import { QueuePills } from "./banners/QueuePills";
import { RetryBanner } from "./banners/RetryBanner";
import { Timeline } from "./Timeline";

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
	const { snapshot, appendUserMessage } = useTimeline(piSessionId);
	const [input, setInput] = React.useState("");
	const promptMutation = usePromptSession();

	if (!piSessionId) {
		return (
			<div className="flex flex-1 items-center justify-center text-zinc-500">
				Select a session, or create one in the sidebar.
			</div>
		);
	}

	async function send(e: React.FormEvent) {
		e.preventDefault();
		const text = input.trim();
		if (!text || snapshot.streaming || !piSessionId) return;
		setInput("");
		appendUserMessage(text);
		try {
			await promptMutation.mutateAsync({ piSessionId, text });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			appendUserMessage(`[ipc error] ${msg}`);
		}
	}

	return (
		<div className="flex flex-1 flex-col bg-[#1a1a1f] p-4">
			<div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
				session {piSessionId}
			</div>
			<Timeline entries={snapshot.timeline} />
			<div className="mt-2 space-y-2">
				<RetryBanner retry={snapshot.retry} />
				<CompactionBanner
					compaction={snapshot.compaction}
					lastResult={snapshot.lastCompactionResult}
				/>
				<QueuePills queue={snapshot.queue} />
			</div>
			<form onSubmit={send} className="flex gap-2 rounded bg-zinc-900 p-2">
				<input
					className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
					placeholder={snapshot.streaming ? "streaming…" : "Type a message"}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					disabled={snapshot.streaming}
				/>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
					disabled={snapshot.streaming || !input.trim()}
				>
					Send
				</button>
			</form>
		</div>
	);
}
