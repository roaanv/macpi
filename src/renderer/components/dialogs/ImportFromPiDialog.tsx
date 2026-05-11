// Confirmation modal for "Import from ~/.pi". Surfaces skill + extension counts
// after the import completes. User can dismiss to acknowledge the result.

import React from "react";
import { useImportResourcesFromPi } from "../../queries";

interface ImportFromPiDialogProps {
	open: boolean;
	onClose: () => void;
}

export function ImportFromPiDialog({ open, onClose }: ImportFromPiDialogProps) {
	const importMutation = useImportResourcesFromPi();
	const [result, setResult] = React.useState<{
		skills: { copied: number; skipped: number };
		extensions: { copied: number; skipped: number };
	} | null>(null);

	React.useEffect(() => {
		if (!open) setResult(null);
	}, [open]);

	if (!open) return null;

	const handleImport = () => {
		importMutation.mutate(undefined, {
			onSuccess: (data) => setResult(data),
		});
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel flex w-[420px] flex-col gap-3 rounded p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label="Import from ~/.pi"
			>
				<div className="text-sm font-semibold">Import from ~/.pi</div>
				<div className="text-xs text-muted">
					Copies top-level files from ~/.pi/skills and directories from
					~/.pi/extensions into your resource root. Files that already exist in
					macpi are skipped (never overwritten).
				</div>
				{result && (
					<div className="text-xs text-emerald-300">
						Imported {result.skills.copied} skill(s); {result.extensions.copied}{" "}
						extension(s); skipped{" "}
						{result.skills.skipped + result.extensions.skipped}.
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
							disabled={importMutation.isPending}
							className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
						>
							{importMutation.isPending ? "Importing…" : "Import"}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
