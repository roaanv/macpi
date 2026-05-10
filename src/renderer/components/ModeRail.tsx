// Vertical icon rail on the far left that switches between top-level modes.
// Only "chat" is enabled in plan 1; the rest are scaffolded but disabled.

type Mode = "chat" | "skills" | "extensions" | "prompts" | "settings";

const ICONS: Record<Mode, string> = {
	chat: "💬",
	skills: "🧩",
	extensions: "🧪",
	prompts: "📜",
	settings: "⚙️",
};

export function ModeRail({
	mode,
	onSelect,
}: {
	mode: Mode;
	onSelect: (m: Mode) => void;
}) {
	const items: { mode: Mode; enabled: boolean }[] = [
		{ mode: "chat", enabled: true },
		{ mode: "skills", enabled: false },
		{ mode: "extensions", enabled: false },
		{ mode: "prompts", enabled: false },
		{ mode: "settings", enabled: false },
	];
	return (
		<div className="flex w-12 flex-col items-center gap-2 bg-[#1f1f24] py-2 text-zinc-300">
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
							: "bg-zinc-800 hover:bg-zinc-700"
					}`}
					title={it.mode}
				>
					{ICONS[it.mode]}
				</button>
			))}
		</div>
	);
}

export type { Mode };
