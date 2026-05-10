// Main chat area that streams tokens from a pi session in real time.
// Subscribes to session.token and session.turn_end events via onPiEvent.

import React from "react";
import { onPiEvent } from "../ipc";
import { usePromptSession } from "../queries";

interface ChatMessage {
	id: number;
	role: "user" | "assistant";
	text: string;
}

interface PiEventToken {
	type: "session.token";
	piSessionId: string;
	delta: string;
}

interface PiEventTurnEnd {
	type: "session.turn_end";
	piSessionId: string;
}

type PiEvent = PiEventToken | PiEventTurnEnd;

let nextId = 0;

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
	const [messages, setMessages] = React.useState<ChatMessage[]>([]);
	const [input, setInput] = React.useState("");
	const [streaming, setStreaming] = React.useState(false);
	const promptMutation = usePromptSession();

	// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is intentionally the only dep — we reset state when the session changes
	React.useEffect(() => {
		setMessages([]);
		setStreaming(false);
	}, [piSessionId]);

	React.useEffect(() => {
		return onPiEvent((ev) => {
			const e = ev as PiEvent;
			if (!piSessionId || e.piSessionId !== piSessionId) return;
			if (e.type === "session.token") {
				setMessages((prev) => {
					const last = prev[prev.length - 1];
					if (last && last.role === "assistant") {
						return [
							...prev.slice(0, -1),
							{ ...last, text: last.text + e.delta },
						];
					}
					return [...prev, { id: nextId++, role: "assistant", text: e.delta }];
				});
			} else if (e.type === "session.turn_end") {
				setStreaming(false);
			}
		});
	}, [piSessionId]);

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
		if (!text || streaming) return;
		if (!piSessionId) return;
		setInput("");
		setMessages((prev) => [...prev, { id: nextId++, role: "user", text }]);
		setStreaming(true);
		try {
			await promptMutation.mutateAsync({ piSessionId, text });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [
				...prev,
				{ id: nextId++, role: "assistant", text: `[ipc error] ${msg}` },
			]);
			setStreaming(false);
		}
	}

	return (
		<div className="flex flex-1 flex-col bg-[#1a1a1f] p-4">
			<div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
				session {piSessionId}
			</div>
			<div className="my-3 flex flex-1 flex-col gap-3 overflow-y-auto">
				{messages.map((m) => (
					<div key={m.id} className="text-sm leading-relaxed">
						<span
							className={
								m.role === "user" ? "text-emerald-300" : "text-amber-300"
							}
						>
							{m.role === "user" ? "you" : "pi"}
						</span>
						<span className="text-zinc-500"> · </span>
						<span className="whitespace-pre-wrap">{m.text}</span>
					</div>
				))}
			</div>
			<form onSubmit={send} className="flex gap-2 rounded bg-zinc-900 p-2">
				<input
					className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none"
					placeholder={streaming ? "streaming…" : "Type a message"}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					disabled={streaming}
				/>
				<button
					type="submit"
					className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
					disabled={streaming || !input.trim()}
				>
					Send
				</button>
			</form>
		</div>
	);
}
