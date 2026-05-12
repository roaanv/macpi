// Pure translator from pi's persisted SessionEntry[] to macpi's renderer-side
// TimelineEntry[]. Used at session-restore time. Never imports SDK runtime
// values — only types — so it can be unit-tested without standing up pi.
//
// Accepts SessionEntry[] (the tree-aware entries from SessionManager.getEntries())
// so that each user message can carry the real pi entry id (piEntryId) needed
// by the branching UI (Task 18).

import type { TimelineEntry } from "../shared/timeline-types";

/** Minimal shape of a pi SessionMessageEntry — only the fields we consume. */
interface SessionMessageEntryLike {
	type: "message";
	id: string;
	message: unknown;
}

/** Minimal shape of any pi SessionEntry — used to skip non-message entries. */
interface SessionEntryLike {
	type: string;
	id: string;
}

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

/**
 * Translate a pi SessionEntry[] (from SessionManager.getEntries()) into a
 * renderer-side TimelineEntry[]. Only "message" type entries are translated;
 * other entry types (compaction, model_change, label, etc.) are skipped.
 *
 * Each translated user message carries `piEntryId` — the real pi session entry
 * id — so the branching button (Task 18) can call navigateTree(piEntryId).
 *
 * For backwards-compatibility and testing, the function also accepts a plain
 * AgentMessage[] (objects without a `type` field). In that case piEntryId is
 * omitted (undefined), preserving pre-branching behaviour.
 */
export function agentMessagesToTimeline(
	sessionEntries: ReadonlyArray<unknown>,
): TimelineEntry[] {
	const entries: TimelineEntry[] = [];
	const toolEntryById = new Map<
		string,
		Extract<TimelineEntry, { kind: "tool-call" }>
	>();

	for (const rawEntry of sessionEntries) {
		if (!rawEntry || typeof rawEntry !== "object") continue;
		const entry = rawEntry as SessionEntryLike;

		// Determine whether this is a SessionEntry (has a "type" field) or a
		// legacy plain AgentMessage (no "type" field, just "role").
		let raw: unknown;
		let piEntryId: string | undefined;
		if (typeof entry.type === "string") {
			// pi SessionEntry — only "message" entries carry AgentMessages.
			if (entry.type !== "message") continue;
			const msgEntry = rawEntry as SessionMessageEntryLike;
			raw = msgEntry.message;
			piEntryId = msgEntry.id;
		} else {
			// Legacy plain AgentMessage (used in unit tests; no entry id available).
			raw = rawEntry;
			piEntryId = undefined;
		}

		if (!raw || typeof raw !== "object") continue;
		const msg = raw as { role?: unknown };

		if (msg.role === "user") {
			entries.push({
				kind: "user",
				id: nextId(),
				text: extractUserText(raw as UserMessageLike),
				piEntryId,
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
				const toolEntry: Extract<TimelineEntry, { kind: "tool-call" }> = {
					kind: "tool-call",
					id: tc.id,
					toolName: tc.name,
					args: tc.arguments,
					state: "pending",
					result: null,
				};
				entries.push(toolEntry);
				toolEntryById.set(tc.id, toolEntry);
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
