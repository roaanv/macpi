// Compact breadcrumb strip rendered above the message timeline.
// Shows: # workspace › session-name. Branching surfaces in the workspace sidebar
// (nested session rows under each parent), so there's no branch segment here.

interface ChatBreadcrumbProps {
	workspaceName: string | null;
	sessionName: string | null;
}

export function ChatBreadcrumb({
	workspaceName,
	sessionName,
}: ChatBreadcrumbProps) {
	const workspace = workspaceName ?? "—";
	const session = sessionName ?? "—";
	return (
		<nav
			className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-divider px-3 py-1 type-metadata"
			aria-label={`Workspace ${workspace}, session ${session}`}
		>
			<span className="flex min-w-0 flex-1 items-center">
				<span className="shrink-0 text-faint">#&nbsp;</span>
				<span className="type-ellipsis" title={workspace}>
					{workspace}
				</span>
			</span>
			<span className="shrink-0 text-faint">›</span>
			<span
				className="min-w-0 flex-1 type-ellipsis text-primary"
				title={session}
			>
				{session}
			</span>
		</nav>
	);
}
