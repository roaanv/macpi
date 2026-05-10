// RetryBanner — display-only transient banner shown while the active turn is
// being retried after a transport/provider error. Driven by the retry slice of
// the TimelineSnapshot; renders nothing when retry is null.

import type { RetryState } from "../../state/timeline-state";

export function RetryBanner({ retry }: { retry: RetryState | null }) {
	if (!retry) return null;
	return (
		<div className="rounded border-l-2 border-amber-500 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
			Retrying ({retry.attempt}/{retry.maxAttempts})… {retry.errorMessage}
		</div>
	);
}
