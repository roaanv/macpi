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
	const accessibleBreadcrumb = [
		workspaceName ? `# ${workspaceName}` : null,
		display,
		cwd,
		piSessionId,
	]
		.filter(Boolean)
		.join(" › ");
	return (
		<nav
			className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b border-divider pb-2 type-metadata"
			aria-label={accessibleBreadcrumb}
		>
			{workspaceName && (
				<>
					<span
						className="min-w-0 type-ellipsis text-muted"
						title={workspaceName}
					>
						#&nbsp;{workspaceName}
					</span>
					<span className="shrink-0">›</span>
				</>
			)}
			<span className="min-w-0 type-ellipsis text-primary" title={display}>
				{display}
			</span>
			{cwd && (
				<>
					<span className="shrink-0">·</span>
					<span className="min-w-0 flex-1 type-ellipsis" title={cwd}>
						{cwd}
					</span>
				</>
			)}
			<span className="shrink-0">·</span>
			<span className="shrink-0 text-faint" title={piSessionId}>
				{shortId}
			</span>
		</nav>
	);
}
