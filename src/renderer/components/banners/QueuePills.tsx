import type { QueueState } from "../../state/timeline-state";

export interface QueuePillsProps {
	queue: QueueState;
	onClear?: () => void;
	onRemove?: (queue: "steering" | "followUp", index: number) => void;
}

export function QueuePills({ queue, onClear, onRemove }: QueuePillsProps) {
	const total = queue.steering.length + queue.followUp.length;
	if (total === 0) return null;
	return (
		<div className="flex flex-wrap items-center gap-1 rounded bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300">
			{queue.steering.map((q, i) => (
				<Pill
					// biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
					key={`steer-${i}`}
					className="bg-indigo-900/60"
					label={`steered: ${ellipsize(q, 24)}`}
					title={q}
					onRemove={onRemove ? () => onRemove("steering", i) : undefined}
				/>
			))}
			{queue.followUp.map((q, i) => (
				<Pill
					// biome-ignore lint/suspicious/noArrayIndexKey: queue items have no stable id
					key={`follow-${i}`}
					className="bg-zinc-700"
					label={`queued: ${ellipsize(q, 24)}`}
					title={q}
					onRemove={onRemove ? () => onRemove("followUp", i) : undefined}
				/>
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

interface PillProps {
	className: string;
	label: string;
	title: string;
	onRemove?: () => void;
}

function Pill({ className, label, title, onRemove }: PillProps) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded py-0.5 pl-2 pr-1 ${className}`}
			title={title}
		>
			<span>{label}</span>
			{onRemove && (
				<button
					type="button"
					onClick={onRemove}
					aria-label={`Remove "${title}" from queue`}
					title="Remove from queue"
					className="flex h-4 w-4 items-center justify-center rounded-full text-[14px] leading-none text-zinc-100 hover:bg-red-500/80 hover:text-white"
				>
					×
				</button>
			)}
		</span>
	);
}

function ellipsize(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
