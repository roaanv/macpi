// Pure translator from pi's persisted AgentMessage[] to macpi's renderer-side
// TimelineEntry[]. Used at session-restore time. Never imports SDK runtime
// values — only types — so it can be unit-tested without standing up pi.

import type { TimelineEntry } from "../renderer/types/timeline";

interface UserMessageLike {
	role: "user";
	content: string | Array<{ type: string; text?: string }>;
}
interface ToolCallLike {
	type: "toolCall";
	id: string;
	name: string;
	arguments: unknown;
}
interface AssistantMessageLike {
	role: "assistant";
	content: Array<
		| { type: "text"; text: string }
		| { type: "thinking"; thinking: string }
		| ToolCallLike
		| { type: string; [k: string]: unknown }
	>;
}
interface ToolResultMessageLike {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: Array<{ type: string; text?: string }>;
	isError: boolean;
}

let counter = 0;
const nextId = () => `r${++counter}`;

export function agentMessagesToTimeline(
	messages: ReadonlyArray<unknown>,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	const toolEntryById = new Map<
		string,
		Extract<TimelineEntry, { kind: "tool-call" }>
	>();

	for (const raw of messages) {
		if (!raw || typeof raw !== "object") continue;
		const msg = raw as { role?: unknown };

		if (msg.role === "user") {
			entries.push({
				kind: "user",
				id: nextId(),
				text: extractUserText(raw as UserMessageLike),
			});
			continue;
		}

		if (msg.role === "assistant") {
			const am = raw as AssistantMessageLike;
			let text = "";
			let thinking = "";
			const calls: ToolCallLike[] = [];
			for (const c of am.content) {
				if (
					c.type === "text" &&
					typeof (c as { text?: unknown }).text === "string"
				) {
					text += (c as { text: string }).text;
				} else if (
					c.type === "thinking" &&
					typeof (c as { thinking?: unknown }).thinking === "string"
				) {
					thinking += (c as { thinking: string }).thinking;
				} else if (c.type === "toolCall") {
					calls.push(c as ToolCallLike);
				}
			}
			if (text.length > 0 || thinking.length > 0) {
				entries.push({
					kind: "assistant-text",
					id: nextId(),
					text,
					thinking,
					streaming: false,
				});
			}
			for (const tc of calls) {
				const entry: Extract<TimelineEntry, { kind: "tool-call" }> = {
					kind: "tool-call",
					id: tc.id,
					toolName: tc.name,
					args: tc.arguments,
					state: "pending",
					result: null,
				};
				entries.push(entry);
				toolEntryById.set(tc.id, entry);
			}
			continue;
		}

		if (msg.role === "toolResult") {
			const tr = raw as ToolResultMessageLike;
			const target = toolEntryById.get(tr.toolCallId);
			if (target) {
				target.state = tr.isError ? "error" : "ok";
				target.result = extractToolResultContent(tr);
			}
		}

		// Custom messages, BashExecutionMessage, BranchSummaryMessage, etc.
		// Skip in v1 — renderer can surface these in a later plan.
	}

	return entries;
}

function extractUserText(msg: UserMessageLike): string {
	if (typeof msg.content === "string") return msg.content;
	return msg.content
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => (c as { text: string }).text)
		.join("");
}

function extractToolResultContent(msg: ToolResultMessageLike): unknown {
	// If the result is a single text content, return it as a string for nicer
	// ToolBlock rendering. Otherwise return the content array verbatim.
	if (msg.content.length === 1 && msg.content[0].type === "text") {
		return msg.content[0].text ?? "";
	}
	return msg.content;
}
