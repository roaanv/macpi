// Reusable categorized modal. Left panel: list of categories. Right
// panel: the active category's component. Click outside or Escape closes.

import React from "react";

export interface SettingsCategory {
	id: string;
	label: string;
	render: () => React.ReactNode;
}

export interface SettingsDialogProps {
	open: boolean;
	title: string;
	categories: SettingsCategory[];
	onClose: () => void;
}

export function SettingsDialog({
	open,
	title,
	categories,
	onClose,
}: SettingsDialogProps) {
	const [activeId, setActiveId] = React.useState<string>(
		categories[0]?.id ?? "",
	);

	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;
	const active = categories.find((c) => c.id === activeId) ?? categories[0];
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape handled via keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel flex h-[80vh] w-[88vw] max-w-[1280px] flex-col overflow-hidden rounded shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div className="flex flex-1 overflow-hidden">
					<aside className="w-48 surface-app border-r border-divider p-3">
						<div className="mb-2 text-[10px] uppercase tracking-widest text-muted">
							{title}
						</div>
						{categories.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => setActiveId(cat.id)}
								className={`w-full rounded px-2 py-1 text-left text-sm ${
									activeId === cat.id
										? "surface-row text-primary"
										: "text-muted hover:surface-row"
								}`}
							>
								{cat.label}
							</button>
						))}
					</aside>
					<section className="flex-1 overflow-y-auto p-6 text-primary">
						{active?.render()}
					</section>
				</div>
				<div className="flex justify-end border-t border-divider p-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded surface-row px-3 py-1 text-xs hover:opacity-80"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
