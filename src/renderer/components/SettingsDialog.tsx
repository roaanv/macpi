// Reusable categorized modal. Left panel: list of categories (optionally
// grouped). Right panel: the active category's component. Click outside or
// Escape closes.

import React from "react";

export interface SettingsCategory {
	id: string;
	label: string;
	group?: string;
	render: () => React.ReactNode;
}

export interface SettingsDialogProps {
	open: boolean;
	title: string;
	categories: SettingsCategory[];
	onClose: () => void;
}

function groupCategories(
	categories: SettingsCategory[],
): { group: string | null; items: SettingsCategory[] }[] {
	const order: string[] = [];
	const buckets = new Map<string, SettingsCategory[]>();
	for (const c of categories) {
		const key = c.group ?? "";
		if (!buckets.has(key)) {
			buckets.set(key, []);
			order.push(key);
		}
		// biome-ignore lint/style/noNonNullAssertion: Map.has guard above guarantees presence.
		buckets.get(key)!.push(c);
	}
	return order.map((k) => ({
		group: k === "" ? null : k,
		items: buckets.get(k) ?? [],
	}));
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
	const groups = groupCategories(categories);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape handled via keydown listener
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-app flex h-[86vh] w-[90vw] max-w-[1100px] flex-col overflow-hidden rounded-lg border border-divider shadow-2xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div className="flex min-h-0 flex-1 overflow-hidden">
					<aside className="flex w-52 flex-col gap-px border-r border-divider surface-panel p-3">
						<div className="mb-2 px-2 font-semibold text-primary text-sm">
							{title}
						</div>
						{groups.map((g) => (
							<React.Fragment key={g.group ?? "_"}>
								{g.group && (
									<div className="mt-3 px-2.5 pb-1 font-semibold text-[10px] text-faint uppercase tracking-widest">
										{g.group}
									</div>
								)}
								{g.items.map((cat) => {
									const isActive = activeId === cat.id;
									return (
										<button
											key={cat.id}
											type="button"
											onClick={() => setActiveId(cat.id)}
											className={`w-full rounded px-2.5 py-1.5 text-left text-[13px] transition-colors ${
												isActive
													? "surface-row-active text-primary"
													: "text-muted hover:surface-row hover:text-primary"
											}`}
										>
											{cat.label}
										</button>
									);
								})}
							</React.Fragment>
						))}
					</aside>
					<section className="flex min-w-0 flex-1 flex-col overflow-hidden">
						<div className="border-b border-divider px-6 py-4">
							<h2 className="font-semibold text-base text-primary">
								{active?.label}
							</h2>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-6 text-primary">
							{active?.render()}
						</div>
					</section>
				</div>
				<div className="flex justify-end border-divider border-t px-4 py-2.5">
					<button
						type="button"
						onClick={onClose}
						className="rounded px-3 py-1 text-muted text-xs hover:surface-row hover:text-primary"
					>
						Close ⌘W
					</button>
				</div>
			</div>
		</div>
	);
}
