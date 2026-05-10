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
			<div className="rounded border-l-2 border-sky-500 bg-sky-900/30 px-3 py-2 text-xs text-sky-200">
				Compacting… ({compaction.reason})
			</div>
		);
	}
	if (!lastResult) return null;
	if (lastResult.ok) {
		return (
			<div className="rounded border-l-2 border-emerald-500 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
				Compacted ✓
			</div>
		);
	}
	return (
		<div className="rounded border-l-2 border-red-500 bg-red-900/30 px-3 py-2 text-xs text-red-200">
			Compaction failed: {lastResult.message ?? "(no message)"}
		</div>
	);
}
