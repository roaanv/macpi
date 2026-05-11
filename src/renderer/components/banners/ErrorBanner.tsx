// ErrorBanner — red banner rendered above the composer when pi has surfaced
// a non-retryable error (auth/model/transient/unknown). Auth gets an
// "Open settings" action; everything else just shows the code + message.
// Dismissing hides the banner until the next session.error event arrives.

import React from "react";
import type { ErrorBannerState } from "../../state/timeline-state";

interface ErrorBannerProps {
	state: ErrorBannerState | null;
	onOpenSettings?: () => void;
}

export function ErrorBanner({ state, onOpenSettings }: ErrorBannerProps) {
	const [dismissed, setDismissed] = React.useState<ErrorBannerState | null>(
		null,
	);

	if (!state) return null;
	// Dismiss tracks a specific (code, message) pair; a fresh error replaces it.
	if (
		dismissed &&
		dismissed.code === state.code &&
		dismissed.message === state.message
	) {
		return null;
	}

	return (
		<div
			role="alert"
			aria-live="assertive"
			className="flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
		>
			<span className="font-semibold uppercase tracking-wide text-[10px] text-red-300">
				{state.code}
			</span>
			<span className="flex-1 whitespace-pre-wrap">{state.message}</span>
			{state.code === "auth" && onOpenSettings && (
				<button
					type="button"
					onClick={onOpenSettings}
					className="rounded border border-red-400/50 px-2 py-0.5 text-xs hover:bg-red-500/20"
				>
					Open settings
				</button>
			)}
			<button
				type="button"
				onClick={() => setDismissed(state)}
				aria-label="Dismiss"
				className="rounded px-1 text-red-300 hover:text-red-100"
			>
				×
			</button>
		</div>
	);
}
