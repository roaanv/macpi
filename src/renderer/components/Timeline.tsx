import React from "react";
import type { TimelineEntry } from "../types/timeline";
import { AssistantMessage } from "./messages/AssistantMessage";
import { ToolBlock } from "./messages/ToolBlock";
import { UserMessage } from "./messages/UserMessage";

// Treat the user as "stuck to bottom" if they're within this many pixels of
// the scroll bottom. Small enough to detect intentional scroll-up but generous
// enough to tolerate sub-pixel rounding.
const STICK_TO_BOTTOM_THRESHOLD_PX = 50;

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const stickToBottomRef = React.useRef(true);

	// Track scroll position. Whenever the user scrolls, recompute whether
	// they're near the bottom. The result drives the autoscroll effect below.
	React.useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const onScroll = () => {
			const distanceFromBottom =
				el.scrollHeight - el.clientHeight - el.scrollTop;
			stickToBottomRef.current =
				distanceFromBottom < STICK_TO_BOTTOM_THRESHOLD_PX;
		};
		el.addEventListener("scroll", onScroll);
		return () => el.removeEventListener("scroll", onScroll);
	}, []);

	// Autoscroll on every entries change. The reducer produces a new array
	// reference on every text_delta, so this fires during streaming.
	// biome-ignore lint/correctness/useExhaustiveDependencies: entries triggers re-run on streaming updates even though the body reads only refs/DOM
	React.useEffect(() => {
		const el = containerRef.current;
		if (!el || !stickToBottomRef.current) return;
		el.scrollTop = el.scrollHeight;
	}, [entries]);

	return (
		<div
			ref={containerRef}
			className="my-3 flex flex-1 flex-col gap-3 overflow-y-auto"
		>
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
