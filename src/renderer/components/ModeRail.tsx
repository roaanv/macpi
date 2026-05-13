// Vertical icon rail on the far left. Each button advertises itself via
// `title` (native hover tooltip) and `aria-label` (screen readers) — the
// emoji alone is ambiguous, especially the flask/scroll icons.

type Mode = "chat" | "skills" | "extensions" | "prompts" | "notes";

interface ModeItem {
	mode: Mode;
	icon: string;
	label: string;
	tooltip: string;
}

const ITEMS: ModeItem[] = [
	{ mode: "chat", icon: "💬", label: "Chat", tooltip: "Chat" },
	{
		mode: "skills",
		icon: "🧩",
		label: "Skills",
		tooltip: "Skills — manage and toggle installed skills",
	},
	{
		mode: "extensions",
		icon: "🧪",
		label: "Extensions",
		tooltip: "Extensions — manage and toggle installed extensions",
	},
	{
		mode: "prompts",
		icon: "📜",
		label: "Prompts",
		tooltip: "Prompts — manage slash-command prompts",
	},
	{
		mode: "notes",
		icon: "📝",
		label: "Notes",
		tooltip: "Notes — quick capture, stored in ~/.macpi/NOTES.md",
	},
];

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
		<div className="flex w-12 flex-col items-center gap-2 surface-rail py-2 text-primary">
			{ITEMS.map((it) => (
				<button
					key={it.mode}
					type="button"
					onClick={() => onSelect(it.mode)}
					className={`h-8 w-8 rounded-md text-base transition ${
						mode === it.mode
							? "bg-indigo-600 text-white"
							: "surface-row hover:opacity-80"
					}`}
					title={it.tooltip}
					aria-label={it.label}
					aria-current={mode === it.mode ? "page" : undefined}
				>
					{it.icon}
				</button>
			))}
			<div className="mt-auto" />
			<button
				type="button"
				onClick={onOpenSettings}
				className="h-8 w-8 rounded-md text-base surface-row hover:opacity-80"
				title="Settings"
				aria-label="Open settings"
			>
				⚙️
			</button>
		</div>
	);
}

export type { Mode };
