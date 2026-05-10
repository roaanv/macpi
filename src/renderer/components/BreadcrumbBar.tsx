// Single-line breadcrumb above the timeline. Renders:
// `# channel › label · /full/cwd · sess-abc12345`
// Long cwds truncate via CSS overflow.

import { computeSessionLabel } from "../utils/label";

export interface BreadcrumbBarProps {
	channelName: string | null;
	piSessionId: string;
	cwd: string | null;
	label: string | null;
}

export function BreadcrumbBar({
	channelName,
	piSessionId,
	cwd,
	label,
}: BreadcrumbBarProps) {
	const display = computeSessionLabel({ piSessionId, cwd, label });
	const shortId = `sess-${piSessionId.slice(0, 8)}`;
	return (
		<div className="flex items-center gap-1 overflow-hidden whitespace-nowrap border-b border-zinc-800 pb-2 text-xs text-zinc-500">
			{channelName && (
				<>
					<span className="text-zinc-400">#&nbsp;{channelName}</span>
					<span>›</span>
				</>
			)}
			<span className="text-zinc-300">{display}</span>
			{cwd && (
				<>
					<span>·</span>
					<span className="truncate" title={cwd}>
						{cwd}
					</span>
				</>
			)}
			<span>·</span>
			<span className="text-zinc-600" title={piSessionId}>
				{shortId}
			</span>
		</div>
	);
}
