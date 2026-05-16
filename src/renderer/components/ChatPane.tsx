// Main chat area. Subscribes to pi events via useTimeline() and renders the
// resulting timeline. Banners and queue pills are wired in Phase E/F.

import React from "react";
import {
	useAbortSession,
	useAttachSession,
	useChannels,
	useClearQueue,
	usePromptSession,
	useReloadSession,
	useRemoveFromQueue,
	useSessionChannel,
	useSessionMeta,
	useSetFirstMessageLabel,
} from "../queries";
import { useTimeline } from "../state/timeline-state";
import { computeSessionLabel, formatFirstMessageLabel } from "../utils/label";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { CompactionBanner } from "./banners/CompactionBanner";
import { ErrorBanner } from "./banners/ErrorBanner";
import { QueuePills } from "./banners/QueuePills";
import { RetryBanner } from "./banners/RetryBanner";
import { SkillsChangedBanner } from "./banners/SkillsChangedBanner";
import { ChatBreadcrumb } from "./ChatBreadcrumb";
import { Composer, type SendIntent } from "./Composer";
import { Timeline } from "./Timeline";

export function ChatPane({
	piSessionId,
	onOpenGlobalSettings,
	onSelectSession,
}: {
	piSessionId: string | null;
	onOpenGlobalSettings?: () => void;
	onSelectSession: (id: string) => void;
}) {
	const attachQuery = useAttachSession(piSessionId);
	const initialTimeline = attachQuery.data?.entries;
	const { snapshot, appendUserMessage } = useTimeline(
		piSessionId,
		initialTimeline,
	);
	const messageHistory = React.useMemo(
		() =>
			snapshot.timeline
				.filter((entry) => entry.kind === "user")
				.map((entry) => entry.text),
		[snapshot.timeline],
	);
	const promptMutation = usePromptSession();
	const clearQueueMutation = useClearQueue();
	const abortMutation = useAbortSession();
	const removeFromQueueMutation = useRemoveFromQueue();
	const setFirstMessageLabelMutation = useSetFirstMessageLabel();
	const reload = useReloadSession();
	const sessionMeta = useSessionMeta(piSessionId);
	const channels = useChannels();
	const sessionChannel = useSessionChannel(piSessionId);
	const channelName =
		channels.data?.channels.find((c) => c.id === sessionChannel.data?.channelId)
			?.name ?? null;

	if (piSessionId && attachQuery.isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted">
				Loading session…
			</div>
		);
	}
	if (piSessionId && attachQuery.isError) {
		const msg =
			attachQuery.error instanceof Error
				? attachQuery.error.message
				: String(attachQuery.error);
		return (
			<div className="flex flex-1 items-center justify-center px-6 text-center text-muted">
				<div>
					Couldn't attach to session{" "}
					<code className="text-primary">{piSessionId}</code>
					<div className="mt-2 text-xs text-red-300">{msg}</div>
				</div>
			</div>
		);
	}

	if (!piSessionId) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted">
				Select a session, or create one in the sidebar.
			</div>
		);
	}

	async function send(text: string, intent: SendIntent) {
		const isFirstUserMessage = snapshot.timeline.every(
			(entry) => entry.kind !== "user",
		);
		if (isFirstUserMessage && piSessionId) {
			const basename = computeSessionLabel({
				piSessionId,
				cwd: sessionMeta.data?.cwd ?? null,
				label: null,
			});
			setFirstMessageLabelMutation.mutate({
				piSessionId,
				text: formatFirstMessageLabel(basename, text),
			});
		}
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
		<div className="flex flex-1 flex-col surface-app p-4">
			<ChatBreadcrumb
				channelName={channelName}
				sessionName={sessionMeta.data?.label ?? null}
			/>
			<BreadcrumbBar
				channelName={channelName}
				piSessionId={piSessionId}
				cwd={sessionMeta.data?.cwd ?? null}
				label={sessionMeta.data?.label ?? null}
			/>
			<Timeline
				entries={snapshot.timeline}
				piSessionId={piSessionId}
				onForkNavigate={onSelectSession}
			/>
			<div className="mt-2 space-y-2">
				<ErrorBanner
					key={piSessionId ?? "no-session"}
					state={snapshot.errorBanner}
					onOpenSettings={onOpenGlobalSettings}
				/>
				<SkillsChangedBanner
					changed={snapshot.skillsChanged}
					reloading={reload.isPending}
					onReload={() => piSessionId && reload.mutate({ piSessionId })}
				/>
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
					onRemove={(queue, index) => {
						if (!piSessionId) return;
						removeFromQueueMutation.mutate({ piSessionId, queue, index });
					}}
				/>
			</div>
			<Composer
				streaming={snapshot.streaming}
				onSend={send}
				messageHistory={messageHistory}
			/>
		</div>
	);
}
