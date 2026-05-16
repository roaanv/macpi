// Left-pane skills list. Header + toolbar at top with Install + Import
// buttons. Each row: enabled checkbox + name (click selects) + hover-revealed
// ⋮ menu with Uninstall. The raw pi source is collapsed to a friendly label
// (and shown in full on hover) because the install path is rarely what the
// user wants to read.

import React from "react";
import { friendlyNameForSource } from "../../shared/friendly-name";
import { useRemoveSkill, useSetSkillEnabled, useSkills } from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { RowMenu } from "./RowMenu";

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
	const remove = useRemoveSkill();
	const [confirmRemove, setConfirmRemove] = React.useState<{
		id: string;
		name: string;
		source: string;
	} | null>(null);
	const [removeError, setRemoveError] = React.useState<string | null>(null);

	const handleUninstall = async () => {
		if (!confirmRemove) return;
		setRemoveError(null);
		try {
			await remove.mutateAsync({ source: confirmRemove.source });
			if (selectedId === confirmRemove.id) onSelect(null);
			setConfirmRemove(null);
		} catch (e) {
			setRemoveError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<aside className="flex h-full w-full min-w-0 flex-col surface-rail border-r border-divider">
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
							className={`group flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === s.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
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
							<RowMenu
								items={[
									{
										label: "Uninstall",
										destructive: true,
										onClick: () =>
											setConfirmRemove({
												id: s.id,
												name: s.name,
												source: s.source,
											}),
									},
								]}
							/>
						</div>
					);
				})}
			</div>
			<ConfirmDialog
				open={!!confirmRemove}
				title="Uninstall skill?"
				body={
					confirmRemove && (
						<>
							Remove <code>{confirmRemove.name}</code> from{" "}
							<code>{confirmRemove.source}</code>. The files are deleted from
							disk; you can reinstall any time.
							{removeError && (
								<div className="mt-2 text-red-400">⚠ {removeError}</div>
							)}
						</>
					)
				}
				confirmLabel={remove.isPending ? "Uninstalling…" : "Uninstall"}
				destructive
				onConfirm={handleUninstall}
				onCancel={() => {
					setConfirmRemove(null);
					setRemoveError(null);
				}}
			/>
		</aside>
	);
}
