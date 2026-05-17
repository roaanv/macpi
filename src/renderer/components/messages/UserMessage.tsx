// Presentational component for a user message entry in the timeline.
// Rendered as a right-aligned chat bubble using --accent / --accent-fg
// so the bubble tracks the active theme. Body goes through MarkdownText
// (same renderer as assistant messages) so headings, lists, and code
// display properly. The branch-button affordance reveals on hover and
// sits outside the bubble so it doesn't compete with content.

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
		<div className="flex justify-end text-[length:var(--font-size-chat-user)] leading-relaxed">
			<div className="group relative flex max-w-[75%] flex-col items-end gap-1">
				<div
					className="macpi-user-bubble rounded-2xl px-3 py-1.5"
					style={{
						background: "var(--accent)",
						color: "var(--accent-fg)",
					}}
				>
					<MarkdownText text={entry.text} />
				</div>
				{piSessionId && entry.piEntryId && (
					<div className="opacity-0 transition-opacity group-hover:opacity-100">
						<MessageBranchButton
							piSessionId={piSessionId}
							piEntryId={entry.piEntryId}
							onForkNavigate={onForkNavigate}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
