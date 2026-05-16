// Vertical icon rail on the far left. Skills / Extensions / Prompts have
// moved into the Settings dialog, so the rail is now Chat · Notes · Settings.
// Active state draws a left-edge accent bar instead of a solid fill, matching
// the toned-down visual system.

import type React from "react";

type Mode = "chat" | "notes";

const SVG_PROPS = {
	width: 16,
	height: 16,
	viewBox: "0 0 20 20",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

function ChatGlyph() {
	return (
		<svg {...SVG_PROPS} aria-hidden="true">
			<path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 2.5v-2.5h-0a2 2 0 0 1-2-2z" />
		</svg>
	);
}

function NoteGlyph() {
	return (
		<svg {...SVG_PROPS} aria-hidden="true">
			<path d="M5 3h7l3 3v11H5z" />
			<path d="M12 3v3h3" />
			<path d="M8 10h5M8 13h5" />
		</svg>
	);
}

// Settings keeps the original ⚙️ emoji glyph (the new monoline SVG felt too
// austere here) but sized to match the 16px chat/note SVGs above so the rail
// reads as one consistent column.
function GearGlyph() {
	return (
		<span
			aria-hidden="true"
			className="inline-flex h-4 w-4 items-center justify-center text-base leading-none"
		>
			⚙️
		</span>
	);
}

interface ModeItem {
	mode: Mode;
	glyph: React.ReactNode;
	label: string;
	tooltip: string;
}

const ITEMS: ModeItem[] = [
	{ mode: "chat", glyph: <ChatGlyph />, label: "Chat", tooltip: "Chat" },
	{
		mode: "notes",
		glyph: <NoteGlyph />,
		label: "Notes",
		tooltip: "Notes — quick capture, stored in ~/.macpi/NOTES.md",
	},
];

function RailButton({
	active,
	tooltip,
	label,
	onClick,
	children,
}: {
	active: boolean;
	tooltip: string;
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
				active
					? "surface-row-active text-primary"
					: "text-muted hover:surface-row hover:text-primary"
			}`}
			title={tooltip}
			aria-label={label}
			aria-current={active ? "page" : undefined}
		>
			{active && (
				<span
					aria-hidden="true"
					className="-left-2 absolute top-1.5 bottom-1.5 w-0.5 rounded-r"
					style={{ background: "var(--accent)" }}
				/>
			)}
			{children}
		</button>
	);
}

export function ModeRail({
	mode,
	onSelect,
	onOpenSettings,
}: {
	mode: Mode;
	onSelect: (m: Mode) => void;
	onOpenSettings: () => void;
}) {
	return (
		<div className="flex w-12 flex-col items-center gap-1 surface-rail py-2">
			{ITEMS.map((it) => (
				<RailButton
					key={it.mode}
					active={mode === it.mode}
					tooltip={it.tooltip}
					label={it.label}
					onClick={() => onSelect(it.mode)}
				>
					{it.glyph}
				</RailButton>
			))}
			<div className="mt-auto" />
			<RailButton
				active={false}
				tooltip="Settings"
				label="Open settings"
				onClick={onOpenSettings}
			>
				<GearGlyph />
			</RailButton>
		</div>
	);
}

export type { Mode };
