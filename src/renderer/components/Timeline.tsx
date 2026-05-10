// Renders an ordered list of TimelineEntry items in the chat pane.

import type { TimelineEntry } from "../types/timeline";
import { AssistantMessage } from "./messages/AssistantMessage";
import { ToolBlock } from "./messages/ToolBlock";
import { UserMessage } from "./messages/UserMessage";

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
	return (
		<div className="my-3 flex flex-1 flex-col gap-3 overflow-y-auto">
			{entries.map((entry) => {
				switch (entry.kind) {
					case "user":
						return <UserMessage key={entry.id} entry={entry} />;
					case "assistant-text":
						return <AssistantMessage key={entry.id} entry={entry} />;
					case "tool-call":
						return <ToolBlock key={entry.id} entry={entry} />;
					default:
						return null;
				}
			})}
		</div>
	);
}
