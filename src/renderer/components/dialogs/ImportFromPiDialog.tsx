// Selective importer for skills or extensions from the user's pi
// installation (~/.pi/agent). Lists every top-level item discovered for the
// given resource kind, lets the user checkmark which to copy in, and shows a
// post-import summary. Items already present in macpi appear disabled with
// an "already imported" badge so the user can see them without re-importing.

import React from "react";
import { useImportPiResources, usePiResources } from "../../queries";

interface ImportFromPiDialogProps {
	open: boolean;
	onClose: () => void;
	resourceKind: "skill" | "extension" | "prompt";
}

export function ImportFromPiDialog({
	open,
	onClose,
	resourceKind,
}: ImportFromPiDialogProps) {
	const list = usePiResources(resourceKind, open);
	const importMutation = useImportPiResources();
	const [selected, setSelected] = React.useState<ReadonlySet<string>>(
		new Set(),
	);
	const [result, setResult] = React.useState<{
		copied: number;
		skipped: number;
	} | null>(null);

	// Reset selection + result whenever the dialog is opened or the kind changes.
	React.useEffect(() => {
		if (!open) return;
		setSelected(new Set());
		setResult(null);
	}, [open]);

	if (!open) return null;

	const items = list.data?.resources ?? [];
	const importable = items.filter((i) => !i.alreadyImported);
	const allImportableSelected =
		importable.length > 0 && importable.every((i) => selected.has(i.name));

	const toggle = (name: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	};

	const toggleAll = () => {
		setSelected(
			allImportableSelected
				? new Set()
				: new Set(importable.map((i) => i.name)),
		);
	};

	const handleImport = () => {
		importMutation.mutate(
			{ kind: resourceKind, names: Array.from(selected) },
			{ onSuccess: (data) => setResult(data) },
		);
	};

	const kindLabel =
		resourceKind === "skill"
			? "skills"
			: resourceKind === "prompt"
				? "prompts"
				: "extensions";
	const sourceLabel =
		resourceKind === "skill"
			? "~/.pi/agent/skills"
			: resourceKind === "prompt"
				? "~/.pi/agent/prompts"
				: "pi's installed packages";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel flex max-h-[80vh] w-[480px] flex-col gap-3 rounded p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={`Import ${kindLabel} from pi`}
			>
				<div className="text-sm font-semibold">
					Import {kindLabel} from {sourceLabel}
				</div>

				{list.isLoading && <div className="text-xs text-muted">Scanning…</div>}

				{list.isError && (
					<div className="text-xs text-red-300">
						{list.error instanceof Error
							? list.error.message
							: String(list.error)}
					</div>
				)}

				{list.data && items.length === 0 && (
					<div className="text-xs text-muted">
						No {kindLabel} found in {sourceLabel}.
					</div>
				)}

				{list.data && items.length > 0 && !result && (
					<>
						<div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
							<span>Available</span>
							{importable.length > 0 && (
								<button
									type="button"
									onClick={toggleAll}
									className="rounded px-1 text-muted hover:text-primary"
								>
									{allImportableSelected ? "Deselect all" : "Select all"}
								</button>
							)}
						</div>
						<div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto rounded border border-divider p-1">
							{items.map((item) => {
								const isSelected = selected.has(item.name);
								const showSource =
									resourceKind === "extension" &&
									item.displayName !== item.name;
								return (
									<label
										key={item.name}
										className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
											item.alreadyImported
												? "text-faint"
												: "text-primary hover:surface-row"
										}`}
									>
										<input
											type="checkbox"
											disabled={item.alreadyImported}
											checked={isSelected && !item.alreadyImported}
											onChange={() => toggle(item.name)}
										/>
										<div className="flex flex-1 flex-col overflow-hidden">
											<span className="truncate">{item.displayName}</span>
											{showSource && (
												<span className="truncate text-[10px] text-faint">
													{item.name}
												</span>
											)}
										</div>
										{item.alreadyImported && (
											<span className="rounded surface-row px-1.5 text-[10px] text-muted">
												already imported
											</span>
										)}
									</label>
								);
							})}
						</div>
					</>
				)}

				{result && (
					<div className="text-xs text-emerald-300">
						Imported {result.copied} {kindLabel}; skipped {result.skipped}.
					</div>
				)}

				{importMutation.isError && (
					<div className="text-xs text-red-300">
						{(importMutation.error as Error).message}
					</div>
				)}

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="surface-row rounded px-3 py-1 text-xs hover:opacity-80"
					>
						{result ? "Close" : "Cancel"}
					</button>
					{!result && (
						<button
							type="button"
							onClick={handleImport}
							disabled={importMutation.isPending || selected.size === 0}
							className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
						>
							{importMutation.isPending
								? "Importing…"
								: `Import ${selected.size > 0 ? `(${selected.size})` : ""}`}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
