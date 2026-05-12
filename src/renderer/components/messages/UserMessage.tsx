// Presentational component for a user message entry in the timeline.

import type { UserMessageEntry } from "../../../shared/timeline-types";
import { MessageBranchButton } from "./MessageBranchButton";

interface UserMessageProps {
	entry: UserMessageEntry;
	piSessionId: string | null;
	onForkNavigate: (newPiSessionId: string) => void;
}

export function UserMessage({
	entry,
	piSessionId,
	onForkNavigate,
}: UserMessageProps) {
	return (
		<div className="group flex items-baseline gap-2 text-[length:var(--font-size-chat-user)] leading-relaxed">
			<div className="flex-1">
				<span className="text-emerald-300">you</span>
				<span className="text-muted"> · </span>
				<span className="whitespace-pre-wrap">{entry.text}</span>
			</div>
			{piSessionId && entry.piEntryId && (
				<MessageBranchButton
					piSessionId={piSessionId}
					piEntryId={entry.piEntryId}
					onForkNavigate={onForkNavigate}
				/>
			)}
		</div>
	);
}
