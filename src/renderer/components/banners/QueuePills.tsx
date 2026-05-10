import type { QueueState } from "../../state/timeline-state";

export interface QueuePillsProps {
	queue: QueueState;
	onClear?: () => void;
}

export function QueuePills({ queue, onClear }: QueuePillsProps) {
	const total = queue.steering.length + queue.followUp.length;
	if (total === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-1 rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
			{queue.steering.map((q, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
					key={`steer-${i}`}
					className="rounded bg-indigo-900/60 px-2 py-0.5"
					title={q}
				>
					steered: {ellipsize(q, 24)}
				</span>
			))}
			{queue.followUp.map((q, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
					key={`follow-${i}`}
					className="rounded bg-zinc-700 px-2 py-0.5"
					title={q}
				>
					queued: {ellipsize(q, 24)}
				</span>
			))}
			{onClear && (
				<button
					type="button"
					onClick={onClear}
					className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
					title="Clear all steered and queued messages"
				>
					Clear
				</button>
			)}
		</div>
	);
}

function ellipsize(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
