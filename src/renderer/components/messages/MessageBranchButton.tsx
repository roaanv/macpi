// Inline button rendered on user message rows (on hover) that branches the
// conversation tree from the corresponding pi entry.

import { useNavigateTree } from "../../queries";

interface MessageBranchButtonProps {
	piSessionId: string;
	piEntryId: string;
}

export function MessageBranchButton({
	piSessionId,
	piEntryId,
}: MessageBranchButtonProps) {
	const navigate = useNavigateTree();
	return (
		<button
			type="button"
			onClick={() => navigate.mutate({ piSessionId, entryId: piEntryId })}
			disabled={navigate.isPending}
			className="invisible rounded px-1 py-0 text-[10px] text-faint hover:text-primary group-hover:visible disabled:opacity-50"
			aria-label="Branch from here"
		>
			↪ Branch here
		</button>
	);
}
