// Vertical icon rail on the far left. Top section: top-level mode
// switcher (only "chat" enabled in current scope). Bottom section:
// settings gear that opens the global settings dialog.

type Mode = "chat" | "skills" | "extensions" | "prompts";

const ICONS: Record<Mode, string> = {
	chat: "💬",
	skills: "🧩",
	extensions: "🧪",
	prompts: "📜",
};

export function ModeRail({
	mode,
	onSelect,
	onOpenSettings,
}: {
	mode: Mode;
	onSelect: (m: Mode) => void;
	onOpenSettings: () => void;
}) {
	const items: { mode: Mode; enabled: boolean }[] = [
		{ mode: "chat", enabled: true },
		{ mode: "skills", enabled: true },
		{ mode: "extensions", enabled: true },
		{ mode: "prompts", enabled: true },
	];
	return (
		<div className="flex w-12 flex-col items-center gap-2 surface-rail py-2 text-primary">
			{items.map((it) => (
				<button
					key={it.mode}
					type="button"
					disabled={!it.enabled}
					onClick={() => {
						if (it.enabled) onSelect(it.mode);
					}}
					className={`h-8 w-8 rounded-md text-base transition disabled:opacity-30 ${
						mode === it.mode
							? "bg-indigo-600 text-white"
							: "surface-row hover:opacity-80"
					}`}
					title={it.mode}
				>
					{ICONS[it.mode]}
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
