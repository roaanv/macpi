// Banner above the composer when tools/resources changed during this session.
// Offers "Reload session" which disposes + reattaches the in-process
// pi session so new skills, extensions, and prompts take effect.

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
			className="flex items-center gap-2 rounded border-l-2 border-warn surface-warn-soft px-3 py-2 text-xs text-warn"
		>
			<span className="flex-1">
				Tools/resources changed — reload the session to apply.
			</span>
			<button
				type="button"
				onClick={onReload}
				disabled={reloading}
				className="rounded border border-warn px-2 py-0.5 hover:surface-warn-soft disabled:opacity-40"
			>
				{reloading ? "Reloading…" : "Reload session"}
			</button>
		</div>
	);
}
