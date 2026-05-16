// Left-pane extensions list. Header + toolbar at top with Install + Import
// buttons. Each row: enabled checkbox + name (click selects) + hover-revealed
// ⋮ menu with Uninstall. Load errors shown inline. Pi sources
// (npm:/git:/local paths) are reduced to a friendly label and the full source
// moves to the row tooltip.

import React from "react";
import { friendlyNameForSource } from "../../shared/friendly-name";
import {
	useExtensions,
	useRemoveExtension,
	useSetExtensionEnabled,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { RowMenu } from "./RowMenu";

interface ExtensionsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}

export function ExtensionsList({
	selectedId,
	onSelect,
	onInstall,
	onImport,
}: ExtensionsListProps) {
	const ext = useExtensions();
	const setEnabled = useSetExtensionEnabled();
	const remove = useRemoveExtension();
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
					Extensions
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
				{ext.isLoading && (
					<div className="p-2 text-xs text-muted">Loading…</div>
				)}
				{ext.data?.loadErrors.map((e) => (
					<div
						key={e.path}
						className="rounded border-l-2 border-red-500 bg-red-500/10 px-2 py-1 text-xs text-red-200"
					>
						<div className="font-semibold">⚠ {e.path}</div>
						<div className="truncate text-[10px]">{e.error}</div>
					</div>
				))}
				{ext.data &&
					ext.data.extensions.length === 0 &&
					ext.data.loadErrors.length === 0 && (
						<div className="p-2 text-xs text-muted">
							No extensions yet. Install or import from ~/.pi.
						</div>
					)}
				{ext.data?.extensions.map((e) => {
					const friendly = friendlyNameForSource(e.source);
					const showSource = friendly !== e.name;
					return (
						<div
							key={e.id}
							className={`group flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === e.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
						>
							<input
								type="checkbox"
								checked={e.enabled}
								onChange={(evt) =>
									setEnabled.mutate({
										id: e.id,
										enabled: evt.target.checked,
									})
								}
								aria-label={`Enable ${e.name}`}
							/>
							<button
								type="button"
								onClick={() => onSelect(e.id)}
								className="flex-1 truncate text-left"
								title={e.source}
							>
								{e.name}
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
												id: e.id,
												name: e.name,
												source: e.source,
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
				title="Uninstall extension?"
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
