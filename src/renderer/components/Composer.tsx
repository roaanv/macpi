// Composer for the chat pane. Owns the input + Send / Steer / Queue buttons.
// Outside streaming: a single Send button. During streaming: Steer (interrupt)
// and Queue (after current turn) buttons; the user can keep typing while the
// agent is mid-turn.

import React from "react";
import { navigateComposerHistory } from "../utils/composer-history";

export type SendIntent = "send" | "steer" | "followUp";

export interface ComposerProps {
	streaming: boolean;
	onSend: (text: string, intent: SendIntent) => Promise<void>;
	messageHistory?: readonly string[];
}

export function Composer({
	streaming,
	onSend,
	messageHistory = [],
}: ComposerProps) {
	const [input, setInput] = React.useState("");
	const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);

	async function submit(intent: SendIntent) {
		const text = input.trim();
		if (!text) return;
		setInput("");
		setHistoryIndex(null);
		await onSend(text, intent);
	}

	function onFormSubmit(e: React.FormEvent) {
		e.preventDefault();
		// Pressing Enter in the input dispatches the default action:
		// - not streaming → "send"
		// - streaming → "followUp" (the safer default; doesn't interrupt the agent)
		void submit(streaming ? "followUp" : "send");
	}

	function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		setInput(e.target.value);
		if (historyIndex !== null && messageHistory[historyIndex] !== e.target.value) {
			setHistoryIndex(null);
		}
	}

	function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		const result = navigateComposerHistory({
			key: e.key,
			input,
			history: messageHistory,
			activeIndex: historyIndex,
		});
		if (!result.handled) {
			if (result.activeIndex !== historyIndex) setHistoryIndex(result.activeIndex);
			return;
		}
		e.preventDefault();
		setInput(result.input);
		setHistoryIndex(result.activeIndex);
	}

	const hasText = input.trim().length > 0;

	return (
		<form
			onSubmit={onFormSubmit}
			className="flex gap-2 rounded surface-app p-2"
		>
			<input
				className="flex-1 bg-transparent text-[length:var(--font-size-composer)] text-primary placeholder-faint outline-none"
				placeholder={
					streaming ? "Steer or queue while streaming…" : "Type a message"
				}
				value={input}
				onChange={onInputChange}
				onKeyDown={onInputKeyDown}
			/>
			{streaming ? (
				<>
					<button
						type="button"
						onClick={() => void submit("steer")}
						className="rounded border border-amber-500 px-3 text-sm text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
						disabled={!hasText}
						title="Interrupt the agent and inject this message before its next step"
					>
						Steer
					</button>
					<button
						type="submit"
						className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
						disabled={!hasText}
						title="Queue this message to run after the current turn finishes"
					>
						Queue
					</button>
				</>
			) : (
				<button
					type="submit"
					className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
					disabled={!hasText}
				>
					Send
				</button>
			)}
		</form>
	);
}
