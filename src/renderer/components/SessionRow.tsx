// One row in the session tree. Renders the row's content plus the tree rails
// (vertical through-rails for ancestors with more siblings, an end-V cap and
// horizontal L-connector for non-root nodes). Reads its own metadata via
// useSessionMeta so it re-renders independently when the user renames or
// auto-label fires. Provides hover-revealed ⋮ menu with Rename and Delete.

import React from "react";
import { useSessionMeta } from "../queries";
import { useIsStreaming } from "../state/streaming-sessions";
import { computeSessionLabel } from "../utils/label";
import { ContextMenu } from "./ContextMenu";
import { RowMenu, type RowMenuItem } from "./RowMenu";

const RAIL_COL_WIDTH = 14;
const RAIL_LEFT_PAD = 12;

export interface SessionRowProps {
	piSessionId: string;
	selected: boolean;
	depth: number;
	// Depths where an ancestor still has a later sibling — render a full-height
	// through-rail at each. Depths are strictly less than this row's depth.
	throughRailDepths: readonly number[];
	// True when this row is the final child at its depth — the end-V cap takes
	// the place of a continuing through-rail.
	isLastChild: boolean;
	// True when this row or one of its descendants is on the active lineage —
	// rails are drawn in the accent colour to highlight the path.
	onActiveLineage: boolean;
	onSelect: () => void;
	onRename: (label: string) => void;
	onRequestDelete: () => void;
}

export function SessionRow({
	piSessionId,
	selected,
	depth,
	throughRailDepths,
	isLastChild,
	onActiveLineage,
	onSelect,
	onRename,
	onRequestDelete,
}: SessionRowProps) {
	const meta = useSessionMeta(piSessionId);
	const streaming = useIsStreaming(piSessionId);
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

	const contentPadLeft = RAIL_LEFT_PAD + depth * RAIL_COL_WIDTH;

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
				style={{ paddingLeft: contentPadLeft, fontSize: "inherit" }}
				className="rounded surface-panel py-1 pr-2 text-primary outline-none"
			/>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu the ⋮ button shows; keyboard-accessible via that button
		<div
			className={`macpi-tree-row group relative flex items-center gap-1 rounded ${
				selected
					? "surface-row-active text-primary"
					: "text-muted hover:surface-row"
			}`}
			title={meta.data?.cwd ?? piSessionId}
			onContextMenu={(e) => {
				e.preventDefault();
				setContextPos({ x: e.clientX, y: e.clientY });
			}}
		>
			<TreeRails
				depth={depth}
				throughRailDepths={throughRailDepths}
				isLastChild={isLastChild}
				onActiveLineage={onActiveLineage}
			/>
			<button
				type="button"
				onClick={onSelect}
				className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 text-left"
				style={{ paddingLeft: contentPadLeft }}
			>
				<span
					aria-hidden="true"
					className={`macpi-node ${
						streaming
							? "macpi-node-streaming"
							: selected
								? "macpi-node-active"
								: ""
					}`}
				>
					<LeafGlyph />
				</span>
				<span className="truncate">{label}</span>
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

// Session marker glyph — a leaf (pi's sprout motif) in place of the old dot.
// Colour comes from the .macpi-node* class via currentColor, so the leaf tracks
// the active/streaming accent and the per-family token with no extra wiring.
function LeafGlyph() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
			<path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
		</svg>
	);
}

function TreeRails({
	depth,
	throughRailDepths,
	isLastChild,
	onActiveLineage,
}: {
	depth: number;
	throughRailDepths: readonly number[];
	isLastChild: boolean;
	onActiveLineage: boolean;
}) {
	if (depth === 0) return null;
	const accent = onActiveLineage ? " macpi-rail-active" : "";
	// Column X for depth d.
	const col = (d: number) => RAIL_LEFT_PAD + d * RAIL_COL_WIDTH - 1;
	return (
		<span className="macpi-tree-rails" aria-hidden="true">
			{throughRailDepths.map((d) => (
				<span key={d} className="macpi-rail-v" style={{ left: col(d) }} />
			))}
			{isLastChild ? (
				<span
					className={`macpi-rail-end-v${accent}`}
					style={{ left: col(depth - 1) }}
				/>
			) : (
				<span
					className={`macpi-rail-v${accent}`}
					style={{ left: col(depth - 1) }}
				/>
			)}
			<span
				className={`macpi-rail-h${accent}`}
				style={{ left: col(depth - 1) + 1 }}
			/>
		</span>
	);
}
