// Compact breadcrumb strip rendered above the message timeline.
// Shows: # channel › session-name. Branching surfaces in the channel sidebar
// (nested session rows under each parent), so there's no branch segment here.

interface ChatBreadcrumbProps {
	channelName: string | null;
	sessionName: string | null;
}

export function ChatBreadcrumb({
	channelName,
	sessionName,
}: ChatBreadcrumbProps) {
	return (
		<div className="flex items-center gap-2 border-b border-divider px-3 py-1 text-xs text-muted">
			<span className="text-faint"># </span>
			<span>{channelName ?? "—"}</span>
			<span className="text-faint">›</span>
			<span className="text-primary">{sessionName ?? "—"}</span>
		</div>
	);
}
