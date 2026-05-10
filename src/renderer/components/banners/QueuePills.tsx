// QueuePills — display-only chips showing the steering and follow-up queues
// for the active session. Steering items render as indigo pills; follow-up
// items render as zinc pills. Renders nothing when both queues are empty.

import type { QueueState } from "../../state/timeline-state";

export function QueuePills({ queue }: { queue: QueueState }) {
	const total = queue.steering.length + queue.followUp.length;
	if (total === 0) return null;
	return (
		<div className="flex flex-wrap gap-1 rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
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
		</div>
	);
}

function ellipsize(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
