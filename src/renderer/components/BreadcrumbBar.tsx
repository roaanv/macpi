// Single-line breadcrumb above the timeline. Renders:
// `# workspace › label · /full/cwd · sess-abc12345`
// Long cwds truncate via CSS overflow.

import { computeSessionLabel } from "../utils/label";

export interface BreadcrumbBarProps {
	workspaceName: string | null;
	piSessionId: string;
	cwd: string | null;
	label: string | null;
}

export function BreadcrumbBar({
	workspaceName,
	piSessionId,
	cwd,
	label,
}: BreadcrumbBarProps) {
	const display = computeSessionLabel({ piSessionId, cwd, label });
	const shortId = `sess-${piSessionId.slice(0, 8)}`;
	return (
		<div className="flex items-center gap-1 overflow-hidden whitespace-nowrap border-b border-divider pb-2 text-xs text-muted">
			{workspaceName && (
				<>
					<span className="text-muted">#&nbsp;{workspaceName}</span>
					<span>›</span>
				</>
			)}
			<span className="text-primary">{display}</span>
			{cwd && (
				<>
					<span>·</span>
					<span className="truncate" title={cwd}>
						{cwd}
					</span>
				</>
			)}
			<span>·</span>
			<span className="text-faint" title={piSessionId}>
				{shortId}
			</span>
		</div>
	);
}
