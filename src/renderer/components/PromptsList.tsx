// Left-pane prompts list. Mirrors SkillsList but each row exposes the
// description and (optional) argument hint on a secondary line — the two
// fields unique to prompts. Top toolbar offers Install + Import. Per-row
// hover-revealed ⋮ menu surfaces Uninstall. Pi sources are collapsed via
// friendlyNameForSource for readability.

import React from "react";
import { friendlyNameForSource } from "../../shared/friendly-name";
import { usePrompts, useRemovePrompt, useSetPromptEnabled } from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { RowMenu } from "./RowMenu";

interface PromptsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}

export function PromptsList({
	selectedId,
	onSelect,
	onInstall,
	onImport,
}: PromptsListProps) {
	const prompts = usePrompts();
	const setEnabled = useSetPromptEnabled();
	const remove = useRemovePrompt();
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
					Prompts
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
				{prompts.isLoading && (
					<div className="p-2 text-xs text-muted">Loading…</div>
				)}
				{prompts.isError && (
					<div className="p-2 text-xs text-red-300">
						{(prompts.error as Error).message}
					</div>
				)}
				{prompts.data && prompts.data.prompts.length === 0 && (
					<div className="p-2 text-xs text-muted">
						No prompts yet. Install or import from ~/.pi.
					</div>
				)}
				{prompts.data?.prompts.map((p) => {
					const friendly = friendlyNameForSource(p.source);
					const showSource = friendly !== p.name;
					return (
						<div
							key={p.id}
							className={`group flex items-start gap-2 rounded px-2 py-1 text-sm ${
								selectedId === p.id
									? "surface-row text-primary"
									: "text-muted hover:surface-row"
							}`}
						>
							<input
								type="checkbox"
								className="mt-1"
								checked={p.enabled}
								onChange={(e) =>
									setEnabled.mutate({ id: p.id, enabled: e.target.checked })
								}
								aria-label={`Enable ${p.name}`}
							/>
							<button
								type="button"
								onClick={() => onSelect(p.id)}
								className="flex-1 overflow-hidden text-left"
								title={p.source}
							>
								<div className="flex items-baseline gap-2">
									<span className="truncate font-medium">{p.name}</span>
									{showSource && (
										<span className="text-[10px] text-faint">{friendly}</span>
									)}
								</div>
								{p.description && (
									<div className="truncate text-xs text-muted">
										{p.description}
									</div>
								)}
								{p.argumentHint && (
									<div className="truncate text-[10px] text-faint">
										args: {p.argumentHint}
									</div>
								)}
							</button>
							<RowMenu
								items={[
									{
										label: "Uninstall",
										destructive: true,
										onClick: () =>
											setConfirmRemove({
												id: p.id,
												name: p.name,
												source: p.source,
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
				title="Uninstall prompt?"
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
