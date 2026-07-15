// Presentational component for an assistant text entry in the timeline.
// Shows streaming text plus a collapsible "thinking" section when present.

import React from "react";
import type { AssistantTextEntry } from "../../../shared/timeline-types";
import { MarkdownText } from "./MarkdownText";

export function AssistantMessage({ entry }: { entry: AssistantTextEntry }) {
	const [thinkingOpen, setThinkingOpen] = React.useState(false);
	const hasThinking = entry.thinking.length > 0;
	const showThinking =
		thinkingOpen || (hasThinking && entry.streaming && !entry.text);

	return (
		<div className="type-body type-assistant">
			<div className="mb-1 type-metadata">
				<span className="text-warn">MacPi</span>
				<span className="text-muted"> · </span>
				{hasThinking && (
					<button
						type="button"
						onClick={() => setThinkingOpen((open) => !open)}
						className="rounded border border-divider px-1.5 py-0.5 type-metadata text-muted hover:surface-row"
					>
						{showThinking ? "▾ thinking" : "▸ thinking"}
					</button>
				)}
			</div>
			{showThinking && (
				<div className="my-1 whitespace-pre-wrap border-l-2 border-divider pl-2 type-status italic text-muted">
					{entry.thinking}
				</div>
			)}
			<MarkdownText text={entry.text} />
		</div>
	);
}
