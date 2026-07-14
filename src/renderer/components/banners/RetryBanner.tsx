// RetryBanner — display-only transient banner shown while the active turn is
// being retried after a transport/provider error. Driven by the retry slice of
// the TimelineSnapshot; renders nothing when retry is null.

import type { RetryState } from "../../state/timeline-state";

export function RetryBanner({ retry }: { retry: RetryState | null }) {
	if (!retry) return null;
	return (
		<div
			role="status"
			className="rounded border-l-2 border-warn surface-warn-soft px-3 py-2 type-status text-warn"
		>
			<span className="type-overline text-warn">Retrying</span>{" "}
			<span className="type-metadata type-tabular text-warn">
				({retry.attempt}/{retry.maxAttempts})
			</span>
			… <span className="type-technical-wrap">{retry.errorMessage}</span>
		</div>
	);
}
