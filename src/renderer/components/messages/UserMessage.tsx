// Presentational component for a user message entry in the timeline.
// Body is rendered through MarkdownText (same renderer as assistant
// messages) so headings, lists, code fences etc. in pasted content
// display properly. MarkdownText also routes links through
// shell.openExternal and sanitises URL schemes.

import type { UserMessageEntry } from "../../../shared/timeline-types";
import { MarkdownText } from "./MarkdownText";
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
		<div className="group text-[length:var(--font-size-chat-user)] leading-relaxed">
			<div className="mb-1 flex items-baseline gap-2">
				<span className="text-emerald-300">you</span>
				<span className="text-muted"> · </span>
				{piSessionId && entry.piEntryId && (
					<div className="ml-auto">
						<MessageBranchButton
							piSessionId={piSessionId}
							piEntryId={entry.piEntryId}
							onForkNavigate={onForkNavigate}
						/>
					</div>
				)}
			</div>
			<MarkdownText text={entry.text} />
		</div>
	);
}
