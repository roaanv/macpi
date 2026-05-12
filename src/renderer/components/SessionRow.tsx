// One row in the sessions list. Reads its own metadata via useSessionMeta
// so it re-renders independently when the user renames or auto-label fires.
// Provides hover-revealed ⋮ menu with Rename and Delete.

import React from "react";
import { useSessionMeta } from "../queries";
import { computeSessionLabel } from "../utils/label";
import { ContextMenu } from "./ContextMenu";
import { RowMenu, type RowMenuItem } from "./RowMenu";

export interface SessionRowProps {
	piSessionId: string;
	selected: boolean;
	depth?: number;
	onSelect: () => void;
	onRename: (label: string) => void;
	onRequestDelete: () => void;
}

export function SessionRow({
	piSessionId,
	selected,
	depth = 0,
	onSelect,
	onRename,
	onRequestDelete,
}: SessionRowProps) {
	const meta = useSessionMeta(piSessionId);
	const [editing, setEditing] = React.useState(false);
	const [draft, setDraft] = React.useState("");
	const [contextPos, setContextPos] = React.useState<{
		x: number;
		y: number;
	} | null>(null);

	const label = computeSessionLabel({
		piSessionId,
		cwd: meta.data?.cwd ?? null,
		label: meta.data?.label ?? null,
	});

	const menuItems: RowMenuItem[] = [
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
	];

	const indentStyle =
		depth > 0 ? { paddingLeft: `${depth * 12}px` } : undefined;

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
				style={indentStyle}
				className="rounded surface-panel px-2 py-1 text-[length:var(--font-size-sidebar)] text-primary outline-none"
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu the ⋮ button shows; keyboard-accessible via that button
		<div
			className={`group flex items-center gap-1 rounded text-[length:var(--font-size-sidebar)] ${
				selected
					? "surface-row font-semibold text-white"
					: "text-muted hover:surface-row"
			}`}
			style={indentStyle}
			title={meta.data?.cwd ?? piSessionId}
			onContextMenu={(e) => {
				e.preventDefault();
				setContextPos({ x: e.clientX, y: e.clientY });
			}}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex-1 truncate px-2 py-1 text-left"
			>
				<span aria-hidden="true" className="mr-1">
					{depth > 0 ? "↳ " : ""}
					{selected ? "●" : "○"}
				</span>
				{label}
			</button>
			<RowMenu items={menuItems} />
			<ContextMenu
				items={menuItems}
				position={contextPos}
				onClose={() => setContextPos(null)}
			/>
		</div>
	);
}
