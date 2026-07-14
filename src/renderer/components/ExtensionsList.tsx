// Left-pane extensions list. Header + install button at top. Each row:
// enabled checkbox + name (click selects) + hover-revealed
// ⋮ menu with Uninstall. Load errors shown inline. Pi sources
// (npm:/git:/local paths) are reduced to a friendly label and the full source
// moves to the row tooltip.

import React from "react";
import { friendlyNameForSource } from "../../shared/friendly-name";
import { useExtensions, useSetExtensionEnabled } from "../queries";
import { RowMenu } from "./RowMenu";
import {
	UninstallResourceDialog,
	type UninstallTarget,
} from "./UninstallResourceDialog";

interface ExtensionsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
}

export function ExtensionsList({
	selectedId,
	onSelect,
	onInstall,
}: ExtensionsListProps) {
	const ext = useExtensions();
	const setEnabled = useSetExtensionEnabled();
	const [removeTarget, setRemoveTarget] =
		React.useState<UninstallTarget | null>(null);

	return (
		<aside className="flex h-full w-full min-w-0 flex-col surface-rail border-r border-divider">
			<div className="border-b border-divider px-3 pb-2 pt-3">
				<div className="type-overline">Extensions</div>
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
				{ext.isLoading && (
					<div className="p-2 type-status text-muted">Loading…</div>
				)}
				{ext.data?.loadErrors.map((e) => (
					<div
						key={e.path}
						className="rounded border-l-2 border-err surface-err-soft px-2 py-1 text-err"
					>
						<div className="type-label type-technical-wrap">⚠ {e.path}</div>
						<div className="type-status type-technical-wrap">{e.error}</div>
					</div>
				))}
				{ext.data &&
					ext.data.extensions.length === 0 &&
					ext.data.loadErrors.length === 0 && (
						<div className="p-2 type-status text-muted">
							No extensions yet. Install a Pi package to add extensions.
						</div>
					)}
				{ext.data?.extensions.map((e) => {
					const friendly = friendlyNameForSource(e.source);
					const showSource = friendly !== e.name;
					return (
						<div
							key={e.id}
							className={`group flex min-w-0 items-center gap-2 rounded px-2 py-1 ${selectedId === e.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
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
								className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
								title={e.source}
							>
								<span className="min-w-0 flex-1 type-label type-ellipsis">
									{e.name}
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
			<UninstallResourceDialog
				kind="extension"
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
