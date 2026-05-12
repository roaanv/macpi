// Compact breadcrumb strip rendered above the message timeline.
// Shows: # channel › session-name, and appends ↪ branch-label when the
// session has branches (data from useSessionTree).

import { useSessionTree } from "../queries";

interface ChatBreadcrumbProps {
	channelName: string | null;
	sessionName: string | null;
	piSessionId: string | null;
}

export function ChatBreadcrumb({
	channelName,
	sessionName,
	piSessionId,
}: ChatBreadcrumbProps) {
	const tree = useSessionTree(piSessionId);
	const branchLabel =
		tree.data?.hasBranches === true ? tree.data.activeBranchLabel : undefined;
	return (
		<div className="flex items-center gap-2 border-b border-divider px-3 py-1 text-xs text-muted">
			<span className="text-faint"># </span>
			<span>{channelName ?? "—"}</span>
			<span className="text-faint">›</span>
			<span className="text-primary">{sessionName ?? "—"}</span>
			{branchLabel && (
				<>
					<span className="text-faint">›</span>
					<span>↪ {branchLabel}</span>
				</>
			)}
		</div>
	);
}
