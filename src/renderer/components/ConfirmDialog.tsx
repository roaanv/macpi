// Modal dialog for destructive confirmations. Click-outside / Escape
// cancels. Caller controls open state.

import React from "react";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	body: React.ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onCancel]);

	if (!open) return null;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; keyboard cancel handled via Escape listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onCancel}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="w-80 rounded surface-panel p-4 text-primary shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div className="mb-2 text-sm font-semibold">{title}</div>
				<div className="mb-4 text-xs text-primary">{body}</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						className="rounded surface-row px-3 py-1 text-xs hover:opacity-80"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={`rounded px-3 py-1 text-xs ${
							destructive
								? "bg-red-600 hover:bg-red-500"
								: "bg-indigo-600 hover:bg-indigo-500"
						}`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
