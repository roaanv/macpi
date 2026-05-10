// Modal for creating a new channel: name + cwd + Browse + Create/Cancel.
// Channel cwd is locked at creation (cannot be edited later).

import React from "react";
import { useCreateChannel, useDefaultCwd, useOpenFolder } from "../queries";

export interface CreateChannelDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: (channelId: string) => void;
}

export function CreateChannelDialog({
	open,
	onClose,
	onCreated,
}: CreateChannelDialogProps) {
	const createChannel = useCreateChannel();
	const openFolder = useOpenFolder();
	const defaultCwd = useDefaultCwd();
	const [name, setName] = React.useState("");
	const [cwd, setCwd] = React.useState("");

	// Seed cwd with the global default whenever the dialog opens.
	React.useEffect(() => {
		if (!open) return;
		setName("");
		setCwd(defaultCwd.data?.cwd ?? "");
	}, [open, defaultCwd.data]);

	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: cwd || undefined });
		if (r.path) setCwd(r.path);
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) return;
		const trimmedCwd = cwd.trim();
		const r = await createChannel.mutateAsync({
			name: trimmedName,
			cwd: trimmedCwd === "" ? null : trimmedCwd,
		});
		onCreated(r.id);
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
				<div className="mb-3 text-sm font-semibold">New channel</div>

				<label className="mb-3 block">
					<div className="mb-1 text-xs text-muted">Name</div>
					<input
						type="text"
						// biome-ignore lint/a11y/noAutofocus: focus the primary input on dialog open
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="my channel"
						className="w-full surface-row rounded px-2 py-1 text-sm"
					/>
				</label>

				<label className="mb-1 block">
					<div className="mb-1 text-xs text-muted">cwd</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={cwd}
							onChange={(e) => setCwd(e.target.value)}
							placeholder={defaultCwd.data?.cwd ?? "/"}
							className="flex-1 surface-row rounded px-2 py-1 text-sm"
						/>
						<button
							type="button"
							onClick={handleBrowse}
							title="Browse for folder"
							className="surface-row rounded px-2 hover:opacity-80"
						>
							📁
						</button>
					</div>
				</label>
				<div className="mb-4 text-[11px] text-muted">
					This cannot be changed after the channel is created.
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
						disabled={!name.trim() || createChannel.isPending}
						className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
					>
						{createChannel.isPending ? "Creating…" : "Create"}
					</button>
				</div>
			</form>
		</div>
	);
}
