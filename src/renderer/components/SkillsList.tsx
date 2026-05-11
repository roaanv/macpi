// Left-pane skills list. Toolbar at top with Install + Import buttons.
// Each row: enabled checkbox + name (click selects). Empty state hints
// the user toward Install / Import.

import { useSetSkillEnabled, useSkills } from "../queries";

interface SkillsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}

export function SkillsList({
	selectedId,
	onSelect,
	onInstall,
	onImport,
}: SkillsListProps) {
	const skills = useSkills();
	const setEnabled = useSetSkillEnabled();

	return (
		<aside className="flex w-64 flex-col surface-rail border-r border-divider">
			<div className="flex gap-2 border-b border-divider p-2">
				<button
					type="button"
					onClick={onInstall}
					className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
				>
					+ Install…
				</button>
				<button
					type="button"
					onClick={onImport}
					className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
				>
					Import from ~/.pi
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-1">
				{skills.isLoading && (
					<div className="p-2 text-xs text-muted">Loading…</div>
				)}
				{skills.isError && (
					<div className="p-2 text-xs text-red-300">
						{(skills.error as Error).message}
					</div>
				)}
				{skills.data && skills.data.skills.length === 0 && (
					<div className="p-2 text-xs text-muted">
						No skills yet. Install or import from ~/.pi.
					</div>
				)}
				{skills.data?.skills.map((s) => (
					<div
						key={s.id}
						className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === s.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
					>
						<input
							type="checkbox"
							checked={s.enabled}
							onChange={(e) =>
								setEnabled.mutate({
									id: s.id,
									enabled: e.target.checked,
								})
							}
							aria-label={`Enable ${s.name}`}
						/>
						<button
							type="button"
							onClick={() => onSelect(s.id)}
							className="flex-1 truncate text-left"
						>
							{s.name}
							<span className="ml-2 text-[10px] text-muted">{s.source}</span>
						</button>
					</div>
				))}
			</div>
		</aside>
	);
}
