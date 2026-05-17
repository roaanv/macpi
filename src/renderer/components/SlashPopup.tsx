// Anchored popup rendered above the Composer textarea. Pure presentational:
// the parent owns the highlight index and pick callback. Renders "No
// matches" as a single non-interactive row so the popup is always visible
// when open, giving the user feedback for typos.

import type { SlashCommand } from "../slash/types";

interface SlashPopupProps {
	open: boolean;
	matches: SlashCommand[];
	highlight: number;
	onHighlight: (index: number) => void;
	onPick: (cmd: SlashCommand) => void;
}

export function SlashPopup({
	open,
	matches,
	highlight,
	onHighlight,
	onPick,
}: SlashPopupProps) {
	if (!open) return null;
	if (matches.length === 0) {
		return (
			<div
				role="listbox"
				aria-label="Slash commands"
				className="surface-panel border-divider max-h-60 overflow-auto rounded border p-2 text-xs text-muted shadow-lg"
			>
				No matches
			</div>
		);
	}
	return (
		<div
			role="listbox"
			aria-label="Slash commands"
			className="surface-panel border-divider max-h-60 overflow-auto rounded border text-primary shadow-lg"
		>
			{matches.map((cmd, i) => {
				const isActive = i === highlight;
				// Highlight uses surface-row-active so it tracks the same active-
				// row treatment used in the channel sidebar / file tree across
				// all themes.
				return (
					<button
						key={`${cmd.kind}:${cmd.name}`}
						type="button"
						role="option"
						aria-selected={isActive}
						onMouseEnter={() => onHighlight(i)}
						onClick={() => onPick(cmd)}
						className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-xs ${
							isActive ? "surface-row-active" : "hover:surface-row"
						}`}
					>
						<span className="font-semibold">/{cmd.name}</span>
						{cmd.argumentHint && (
							<span className="text-muted">{cmd.argumentHint}</span>
						)}
						<span className="ml-auto truncate text-muted">
							{cmd.description}
						</span>
					</button>
				);
			})}
		</div>
	);
}
