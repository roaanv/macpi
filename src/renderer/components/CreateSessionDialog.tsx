// Modal for creating a new session in a workspace. The session inherits
// the workspace's cwd (cannot be changed). Name is optional — empty name
// lets the auto-label-on-first-message flow run as before.

import React from "react";
import { useCreateSession, useWorkspaces } from "../queries";

export interface CreateSessionDialogProps {
	workspaceId: string | null;
	onClose: () => void;
	onCreated: (piSessionId: string) => void;
}

export function CreateSessionDialog({
	workspaceId,
	onClose,
	onCreated,
}: CreateSessionDialogProps) {
	const workspaces = useWorkspaces();
	const createSession = useCreateSession();
	const [name, setName] = React.useState("");

	const workspace = workspaces.data?.workspaces.find(
		(candidate) => candidate.id === workspaceId,
	);

	React.useEffect(() => {
		if (!workspaceId) return;
		setName("");
	}, [workspaceId]);

	React.useEffect(() => {
		if (!workspaceId) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [workspaceId, onClose]);

	if (!workspaceId || !workspace) return null;

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		const r = await createSession.mutateAsync({
			workspaceId: workspace.id,
			label: name.trim() || undefined,
		});
		onCreated(r.piSessionId);
		onClose();
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape handled via keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<form
				onSubmit={handleCreate}
				className="surface-panel w-96 rounded p-5 text-primary shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
			>
				<div className="mb-3 text-sm font-semibold">
					New session in <span className="text-muted">#</span> {workspace.name}
				</div>

				<label className="mb-1 block">
					<div className="mb-1 text-xs text-muted">Name (optional)</div>
					<input
						type="text"
						// biome-ignore lint/a11y/noAutofocus: focus the primary input on dialog open
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="leave blank for auto-label"
						className="w-full surface-row rounded px-2 py-1 text-sm"
					/>
				</label>
				<div className="mb-4 text-[11px] text-muted">
					cwd: {workspace.cwd ?? "(global default)"}
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded surface-row px-3 py-1 text-xs hover:opacity-80"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={createSession.isPending}
						className="rounded surface-accent px-3 py-1 text-xs hover:opacity-90 disabled:opacity-50"
					>
						{createSession.isPending ? "Creating…" : "Create"}
					</button>
				</div>
			</form>
		</div>
	);
}
