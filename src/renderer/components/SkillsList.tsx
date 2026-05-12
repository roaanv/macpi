// Left-pane skills list. Header + toolbar at top with Install + Import
// buttons. Each row: enabled checkbox + name (click selects). The raw
// pi source is collapsed to a friendly label (and shown in full on hover)
// because the install path is rarely what the user wants to read.

import { friendlyNameForSource } from "../../shared/friendly-name";
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
			<div className="border-b border-divider px-3 pb-2 pt-3">
				<div className="text-xs font-semibold uppercase tracking-wide text-muted">
					Skills
				</div>
				<div className="mt-2 flex gap-2">
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
				{skills.data?.skills.map((s) => {
					const friendly = friendlyNameForSource(s.source);
					const showSource = friendly !== s.name;
					return (
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
								title={s.source}
							>
								{s.name}
								{showSource && (
									<span className="ml-2 text-[10px] text-faint">
										{friendly}
									</span>
								)}
							</button>
						</div>
					);
				})}
			</div>
		</aside>
	);
}
