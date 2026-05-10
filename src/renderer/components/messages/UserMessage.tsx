// Presentational component for a user message entry in the timeline.

import type { UserMessageEntry } from "../../types/timeline";

export function UserMessage({ entry }: { entry: UserMessageEntry }) {
	return (
		<div className="text-[length:var(--font-size-chat-user)] leading-relaxed">
			<span className="text-emerald-300">you</span>
			<span className="text-muted"> · </span>
			<span className="whitespace-pre-wrap">{entry.text}</span>
		</div>
	);
}
