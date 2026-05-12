// Inline button rendered on user message rows (on hover) that forks the
// session at this pi entry. Pi creates a new session file (with the parent's
// history up to and including this entry); macpi attaches it under the
// parent's channel with parent_pi_session_id = parent session. The caller is
// notified via onForkNavigate so the renderer can switch to the new session.

import { useForkSession } from "../../queries";

interface MessageBranchButtonProps {
	piSessionId: string;
	piEntryId: string;
	onForkNavigate: (newPiSessionId: string) => void;
}

export function MessageBranchButton({
	piSessionId,
	piEntryId,
	onForkNavigate,
}: MessageBranchButtonProps) {
	const fork = useForkSession();
	const errMsg = fork.error
		? fork.error instanceof Error
			? fork.error.message
			: String(fork.error)
		: null;
	return (
		<div className="flex flex-col items-end">
			<button
				type="button"
				onClick={() =>
					fork.mutate(
						{ piSessionId, entryId: piEntryId, position: "at" },
						{ onSuccess: (r) => onForkNavigate(r.newSessionId) },
					)
				}
				disabled={fork.isPending}
				className="invisible rounded px-1 py-0 text-[10px] text-faint hover:text-primary group-hover:visible disabled:opacity-50"
				aria-label="Branch from here"
			>
				{fork.isPending ? "forking…" : "↪ Branch here"}
			</button>
			{errMsg && (
				<span className="text-[10px] text-red-300" title={errMsg} role="alert">
					fork failed: {errMsg.length > 40 ? `${errMsg.slice(0, 40)}…` : errMsg}
				</span>
			)}
		</div>
	);
}
