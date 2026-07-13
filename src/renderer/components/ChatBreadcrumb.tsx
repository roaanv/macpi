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
	return (
		<div className="flex items-center gap-2 border-b border-divider px-3 py-1 text-xs text-muted">
			<span className="text-faint"># </span>
			<span>{workspaceName ?? "—"}</span>
			<span className="text-faint">›</span>
			<span className="text-primary">{sessionName ?? "—"}</span>
		</div>
	);
}
