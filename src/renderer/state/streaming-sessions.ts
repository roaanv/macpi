// Global registry of pi sessions currently streaming a turn. Subscribes once
// to PiEvents at module load and updates an in-memory Set; consumers read it
// via useStreamingSessions(). This lets the channel sidebar paint a pulse
// indicator on any streaming session, including ones not currently focused.

import React from "react";
import { onPiEvent } from "../ipc";

const streaming = new Set<string>();
const subscribers = new Set<() => void>();

function notify() {
	for (const cb of subscribers) cb();
}

let unsubscribe: (() => void) | null = null;

function ensureSubscribed() {
	if (unsubscribe) return;
	unsubscribe = onPiEvent((raw) => {
		if (!raw || typeof raw !== "object") return;
		const ev = raw as { type?: unknown; piSessionId?: unknown };
		if (typeof ev.piSessionId !== "string") return;
		if (ev.type === "session.turn_start") {
			streaming.add(ev.piSessionId);
			notify();
		} else if (ev.type === "session.turn_end") {
			if (streaming.delete(ev.piSessionId)) notify();
		}
	});
}

function subscribe(cb: () => void): () => void {
	ensureSubscribed();
	subscribers.add(cb);
	return () => {
		subscribers.delete(cb);
	};
}

function getSnapshot(): ReadonlySet<string> {
	return streaming;
}

export function useIsStreaming(piSessionId: string): boolean {
	return React.useSyncExternalStore(
		subscribe,
		() => getSnapshot().has(piSessionId),
		() => false,
	);
}
