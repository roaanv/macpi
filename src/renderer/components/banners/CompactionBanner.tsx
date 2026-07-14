// CompactionBanner — display-only transient banner showing compaction state
// (active compaction with reason, success acknowledgement, or failure with
// error message). Driven by the compaction + lastCompactionResult slices of
// the TimelineSnapshot; renders nothing when both are absent.

import type {
	CompactionState,
	TimelineSnapshot,
} from "../../state/timeline-state";

export function CompactionBanner({
	compaction,
	lastResult,
}: {
	compaction: CompactionState | null;
	lastResult: TimelineSnapshot["lastCompactionResult"];
}) {
	if (compaction) {
		return (
			<div
				role="status"
				className="rounded border-l-2 border-accent surface-accent-soft px-3 py-2 type-status text-accent"
			>
				<span className="type-overline text-accent">Compacting</span>… (
				{compaction.reason})
			</div>
		);
	}
	if (!lastResult) return null;
	if (lastResult.ok) {
		return (
			<div
				role="status"
				className="rounded border-l-2 border-ok surface-ok-soft px-3 py-2 type-status text-ok"
			>
				<span className="type-overline text-ok">Compacted</span> ✓
			</div>
		);
	}
	return (
		<div
			role="alert"
			className="rounded border-l-2 border-err surface-err-soft px-3 py-2 type-status text-err"
		>
			<span className="type-overline text-err">Compaction failed</span>:{" "}
			<span className="type-technical-wrap">
				{lastResult.message ?? "(no message)"}
			</span>
		</div>
	);
}
