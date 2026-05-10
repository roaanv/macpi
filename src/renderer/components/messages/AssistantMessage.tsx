// Presentational component for an assistant text entry in the timeline.
// Shows streaming text plus a collapsible "thinking" section when present.

import React from "react";
import type { AssistantTextEntry } from "../../../shared/timeline-types";

export function AssistantMessage({ entry }: { entry: AssistantTextEntry }) {
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const hasThinking = entry.thinking.length > 0;
	const showThinking =
		thinkingOpen || (hasThinking && entry.streaming && !entry.text);

	return (
		<div className="text-[length:var(--font-size-chat-assistant)] leading-relaxed">
			<span className="text-amber-300">pi</span>
			<span className="text-muted"> · </span>
			{hasThinking && (
				<button
					type="button"
					onClick={() => setThinkingOpen((open) => !open)}
					className="mr-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-muted hover:surface-row"
				>
					{showThinking ? "▾ thinking" : "▸ thinking"}
				</button>
			)}
			{showThinking && (
				<div className="my-1 border-l-2 border-zinc-700 pl-2 text-xs italic text-muted whitespace-pre-wrap">
					{entry.thinking}
				</div>
			)}
			<span className="whitespace-pre-wrap">{entry.text}</span>
		</div>
	);
}
