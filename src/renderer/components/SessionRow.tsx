// One row in the sessions list. Reads its own metadata via useSessionMeta
// so it re-renders independently when the user renames or auto-label fires.
// Provides hover-revealed ⋮ menu with Rename and Delete.

import React from "react";
import { useSessionMeta } from "../queries";
import { computeSessionLabel } from "../utils/label";
import { RowMenu } from "./RowMenu";

export interface SessionRowProps {
	piSessionId: string;
	selected: boolean;
	onSelect: () => void;
	onRename: (label: string) => void;
	onRequestDelete: () => void;
}

export function SessionRow({
	piSessionId,
	selected,
	onSelect,
	onRename,
	onRequestDelete,
}: SessionRowProps) {
	const meta = useSessionMeta(piSessionId);
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState("");

	const label = computeSessionLabel({
		piSessionId,
		cwd: meta.data?.cwd ?? null,
		label: meta.data?.label ?? null,
	});

	if (editing) {
		return (
			<input
				// biome-ignore lint/a11y/noAutofocus: focus is intentional when entering inline rename mode
				autoFocus
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={() => {
					const trimmed = draft.trim();
					if (trimmed && trimmed !== label) {
						onRename(trimmed);
					}
					setEditing(false);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						(e.target as HTMLInputElement).blur();
					} else if (e.key === "Escape") {
						setEditing(false);
					}
				}}
				className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none"
			/>
		);
	}

	return (
		<div
			className={`group flex items-center gap-1 rounded text-xs ${
				selected ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
			}`}
			title={meta.data?.cwd ?? piSessionId}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex-1 truncate px-2 py-1 text-left"
			>
				▸ {label}
			</button>
			<RowMenu
				items={[
					{
						label: "Rename",
						onClick: () => {
							setDraft(label);
							setEditing(true);
						},
					},
					{
						label: "Delete",
						destructive: true,
						onClick: onRequestDelete,
					},
				]}
			/>
		</div>
	);
}
