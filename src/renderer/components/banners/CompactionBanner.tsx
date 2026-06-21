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
			<div className="rounded border-l-2 border-accent surface-accent-soft px-3 py-2 text-xs text-accent">
				Compacting… ({compaction.reason})
			</div>
		);
	}
	if (!lastResult) return null;
	if (lastResult.ok) {
		return (
			<div className="rounded border-l-2 border-ok surface-ok-soft px-3 py-2 text-xs text-ok">
				Compacted ✓
			</div>
		);
	}
	return (
		<div className="rounded border-l-2 border-err surface-err-soft px-3 py-2 text-xs text-err">
			Compaction failed: {lastResult.message ?? "(no message)"}
		</div>
	);
}
