// Left-pane skills list. Header + install button at top. Each row:
// enabled checkbox + name (click selects) + hover-revealed
// ⋮ menu with Uninstall. The raw pi source is collapsed to a friendly label
// (and shown in full on hover) because the install path is rarely what the
// user wants to read.

import React from "react";
import { friendlyNameForSource } from "../../shared/friendly-name";
import { useSetSkillEnabled, useSkills } from "../queries";
import { RowMenu } from "./RowMenu";
import {
	UninstallResourceDialog,
	type UninstallTarget,
} from "./UninstallResourceDialog";

interface SkillsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
}

export function SkillsList({
	selectedId,
	onSelect,
	onInstall,
}: SkillsListProps) {
	const skills = useSkills();
	const setEnabled = useSetSkillEnabled();
	const [removeTarget, setRemoveTarget] =
		React.useState<UninstallTarget | null>(null);

	return (
		<aside className="flex h-full w-full min-w-0 flex-col surface-rail border-r border-divider">
			<div className="border-b border-divider px-3 pb-2 pt-3">
				<div className="type-overline">Skills</div>
				<div className="mt-2 flex gap-2">
					<button
						type="button"
						onClick={onInstall}
						className="surface-row rounded px-2 py-1 type-control hover:opacity-80"
					>
						+ Install…
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-1">
				{skills.isLoading && (
					<div className="p-2 type-status text-muted">Loading…</div>
				)}
				{skills.isError && (
					<div className="p-2 type-status text-err">
						{(skills.error as Error).message}
					</div>
				)}
				{skills.data && skills.data.skills.length === 0 && (
					<div className="p-2 type-status text-muted">
						No skills yet. Install a Pi package to add skills.
					</div>
				)}
				{skills.data?.skills.map((s) => {
					const friendly = friendlyNameForSource(s.source);
					const showSource = friendly !== s.name;
					return (
						<div
							key={s.id}
							className={`group flex min-w-0 items-center gap-2 rounded px-2 py-1 ${selectedId === s.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
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
								className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
								title={s.source}
							>
								<span className="min-w-0 flex-1 type-label type-ellipsis">
									{s.name}
								</span>
								{showSource && (
									<span className="min-w-0 type-metadata type-ellipsis text-faint">
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
											setRemoveTarget({
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
			<UninstallResourceDialog
				kind="skill"
				target={removeTarget}
				onUninstalled={(t) => {
					if (selectedId === t.id) onSelect(null);
					setRemoveTarget(null);
				}}
				onCancel={() => setRemoveTarget(null)}
			/>
		</aside>
	);
}
