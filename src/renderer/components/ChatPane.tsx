// Main chat area. Subscribes to pi events via useTimeline() and renders the
// resulting timeline. Banners and queue pills are wired in Phase E/F.

import { useAbortSession, useClearQueue, usePromptSession } from "../queries";
import { useTimeline } from "../state/timeline-state";
import { CompactionBanner } from "./banners/CompactionBanner";
import { QueuePills } from "./banners/QueuePills";
import { RetryBanner } from "./banners/RetryBanner";
import { Composer, type SendIntent } from "./Composer";
import { Timeline } from "./Timeline";

export function ChatPane({ piSessionId }: { piSessionId: string | null }) {
	const { snapshot, appendUserMessage } = useTimeline(piSessionId);
	const promptMutation = usePromptSession();
	const clearQueueMutation = useClearQueue();
	const abortMutation = useAbortSession();

	if (!piSessionId) {
		return (
			<div className="flex flex-1 items-center justify-center text-zinc-500">
				Select a session, or create one in the sidebar.
			</div>
		);
	}

	async function send(text: string, intent: SendIntent) {
		appendUserMessage(text);
		try {
			if (intent === "steer") {
				// Steer = interrupt now. Pi's streamingBehavior="steer" is a queue
				// between tool calls — for text-only turns it's indistinguishable
				// from followUp. We use abort + fresh prompt instead so the user's
				// mental model of "interrupt and redirect" actually holds.
				await abortMutation.mutateAsync({ piSessionId: piSessionId as string });
				await promptMutation.mutateAsync({
					piSessionId: piSessionId as string,
					text,
				});
				return;
			}
			if (intent === "followUp") {
				await promptMutation.mutateAsync({
					piSessionId: piSessionId as string,
					text,
					streamingBehavior: "followUp",
				});
				return;
			}
			// intent === "send"
			await promptMutation.mutateAsync({
				piSessionId: piSessionId as string,
				text,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			appendUserMessage(`[ipc error] ${msg}`);
		}
	}

	return (
		<div className="flex flex-1 flex-col bg-[#1a1a1f] p-4">
			<div className="border-b border-zinc-800 pb-2 text-xs text-zinc-500">
				session {piSessionId}
			</div>
			<Timeline entries={snapshot.timeline} />
			<div className="mt-2 space-y-2">
				<RetryBanner retry={snapshot.retry} />
				<CompactionBanner
					compaction={snapshot.compaction}
					lastResult={snapshot.lastCompactionResult}
				/>
				<QueuePills
					queue={snapshot.queue}
					onClear={() => {
						if (!piSessionId) return;
						clearQueueMutation.mutate({ piSessionId });
					}}
				/>
			</div>
			<Composer streaming={snapshot.streaming} onSend={send} />
		</div>
	);
}
