// A timeline entry represents one rendered block in the chat pane.
// Multiple entries can be in flight at once (assistant text streaming
// while a tool call is also in progress).

export interface UserMessageEntry {
	kind: "user";
	id: string;
	text: string;
	piEntryId?: string; // pi's SessionEntry.id; absent for not-yet-promoted local entries
}

export interface AssistantTextEntry {
	kind: "assistant-text";
	id: string;
	text: string;
	thinking: string;
	streaming: boolean;
}

export interface ToolCallEntry {
	kind: "tool-call";
	id: string; // = pi's toolCallId
	toolName: string;
	args: unknown;
	state: "pending" | "ok" | "error";
	result: unknown;
}

export type TimelineEntry =
	| UserMessageEntry
	| AssistantTextEntry
	| ToolCallEntry;
