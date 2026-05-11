// Left-pane extensions list. Toolbar at top with Install + Import buttons.
// Each row: enabled checkbox + name (click selects). Load errors shown inline.
// Empty state hints the user toward Install / Import.

import { useExtensions, useSetExtensionEnabled } from "../queries";

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
				{ext.data?.extensions.map((e) => (
					<div
						key={e.id}
						className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${selectedId === e.id ? "surface-row text-primary" : "text-muted hover:surface-row"}`}
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
						>
							{e.name}
							<span className="ml-2 text-[10px] text-muted">{e.source}</span>
						</button>
					</div>
				))}
			</div>
		</aside>
	);
}
