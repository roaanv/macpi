// useTimeline() — subscribes to pi events for one session and reduces them
// into a TimelineSnapshot consumed by ChatPane. Owns the in-memory derived
// state (timeline entries, streaming flag, queue/retry/compaction banners).
// The hook resets on piSessionId change.

import React from "react";
import type { PiEvent } from "../../shared/pi-events";
import { onPiEvent } from "../ipc";
import type {
	AssistantTextEntry,
	TimelineEntry,
	ToolCallEntry,
} from "../types/timeline";

export interface QueueState {
	steering: readonly string[];
	followUp: readonly string[];
}

export interface RetryState {
	attempt: number;
	maxAttempts: number;
	errorMessage: string;
}

export interface CompactionState {
	reason: "manual" | "threshold" | "overflow";
}

export interface TimelineSnapshot {
	timeline: TimelineEntry[];
	streaming: boolean;
	queue: QueueState;
	retry: RetryState | null;
	compaction: CompactionState | null;
	lastCompactionResult: { ok: boolean; message?: string } | null;
}

const EMPTY: TimelineSnapshot = {
	timeline: [],
	streaming: false,
	queue: { steering: [], followUp: [] },
	retry: null,
	compaction: null,
	lastCompactionResult: null,
};

let entryIdCounter = 0;
const nextEntryId = () => `e${++entryIdCounter}`;

/**
 * Subscribes to pi events for one session and maintains a derived snapshot.
 * Returns the snapshot plus an `appendUserMessage` function the chat pane
 * calls when the user clicks Send.
 *
 * Resets when piSessionId changes.
 */
export function useTimeline(piSessionId: string | null): {
	snapshot: TimelineSnapshot;
	appendUserMessage: (text: string) => void;
} {
	const [snapshot, setSnapshot] = React.useState<TimelineSnapshot>(EMPTY);

	// Reset on session change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is the only meaningful dep
	React.useEffect(() => {
		setSnapshot(EMPTY);
	}, [piSessionId]);

	React.useEffect(() => {
		if (!piSessionId) return;
		return onPiEvent((raw) => {
			const e = raw as PiEvent;
			if (e.piSessionId !== piSessionId) return;
			setSnapshot((prev) => reduce(prev, e));
		});
	}, [piSessionId]);

	const appendUserMessage = React.useCallback((text: string) => {
		setSnapshot((prev) => ({
			...prev,
			streaming: true,
			timeline: [...prev.timeline, { kind: "user", id: nextEntryId(), text }],
		}));
	}, []);

	return { snapshot, appendUserMessage };
}

function reduce(prev: TimelineSnapshot, event: PiEvent): TimelineSnapshot {
	switch (event.type) {
		case "session.turn_start":
			return { ...prev, streaming: true };
		case "session.turn_end":
			return {
				...prev,
				streaming: false,
				timeline: prev.timeline.map((entry) =>
					entry.kind === "assistant-text" && entry.streaming
						? { ...entry, streaming: false }
						: entry,
				),
			};
		case "session.text_delta":
			return appendOrPatchAssistantText(prev, event.delta, "text");
		case "session.thinking_delta":
			return appendOrPatchAssistantText(prev, event.delta, "thinking");
		case "session.tool_start":
			return {
				...prev,
				timeline: [
					...prev.timeline,
					{
						kind: "tool-call",
						id: event.toolCallId,
						toolName: event.toolName,
						args: event.args,
						state: "pending",
						result: null,
					} satisfies ToolCallEntry,
				],
			};
		case "session.tool_end":
			return {
				...prev,
				timeline: prev.timeline.map((entry) =>
					entry.kind === "tool-call" && entry.id === event.toolCallId
						? {
								...entry,
								state: event.isError ? "error" : "ok",
								result: event.result,
							}
						: entry,
				),
			};
		case "session.queue_update":
			return {
				...prev,
				queue: { steering: event.steering, followUp: event.followUp },
			};
		case "session.retry_start":
			return {
				...prev,
				retry: {
					attempt: event.attempt,
					maxAttempts: event.maxAttempts,
					errorMessage: event.errorMessage,
				},
			};
		case "session.retry_end":
			return { ...prev, retry: null };
		case "session.compaction_start":
			return {
				...prev,
				compaction: { reason: event.reason },
				lastCompactionResult: null,
			};
		case "session.compaction_end":
			return {
				...prev,
				compaction: null,
				lastCompactionResult: event.aborted
					? { ok: false, message: event.errorMessage }
					: { ok: true },
			};
		default:
			return prev;
	}
}

function appendOrPatchAssistantText(
	prev: TimelineSnapshot,
	delta: string,
	field: "text" | "thinking",
): TimelineSnapshot {
	const last = prev.timeline[prev.timeline.length - 1];
	if (last && last.kind === "assistant-text" && last.streaming) {
		const patched: AssistantTextEntry = {
			...last,
			[field]: last[field] + delta,
		};
		return {
			...prev,
			timeline: [...prev.timeline.slice(0, -1), patched],
		};
	}
	const created: AssistantTextEntry = {
		kind: "assistant-text",
		id: nextEntryId(),
		text: field === "text" ? delta : "",
		thinking: field === "thinking" ? delta : "",
		streaming: true,
	};
	return { ...prev, timeline: [...prev.timeline, created] };
}
