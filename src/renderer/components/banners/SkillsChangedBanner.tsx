// Banner above the composer when skills changed during this session.
// Offers "Reload session" which disposes + reattaches the in-process
// pi session so the new skills take effect.

interface SkillsChangedBannerProps {
	changed: boolean;
	reloading: boolean;
	onReload: () => void;
}

export function SkillsChangedBanner({
	changed,
	reloading,
	onReload,
}: SkillsChangedBannerProps) {
	if (!changed) return null;
	return (
		<div
			role="status"
			className="flex items-center gap-2 rounded border-l-2 border-amber-500 bg-amber-900/30 px-3 py-2 text-xs text-amber-200"
		>
			<span className="flex-1">
				Skills changed — reload the session to apply.
			</span>
			<button
				type="button"
				onClick={onReload}
				disabled={reloading}
				className="rounded border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/20 disabled:opacity-40"
			>
				{reloading ? "Reloading…" : "Reload session"}
			</button>
		</div>
	);
}
