// Hover-revealed ⋮ menu for sidebar rows. Click toggles the popover;
// outside-click and Escape close it.

import React from "react";

export interface RowMenuItem {
	label: string;
	onClick: () => void;
	destructive?: boolean;
}

export interface RowMenuProps {
	items: RowMenuItem[];
	/** Show the trigger always (true) or only on hover (false, default). */
	alwaysVisible?: boolean;
}

export function RowMenu({ items, alwaysVisible }: RowMenuProps) {
	const [open, setOpen] = React.useState(false);
	const wrapRef = React.useRef<HTMLSpanElement | null>(null);

	React.useEffect(() => {
		if (!open) return;
		const onClick = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onClick);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<span ref={wrapRef} className="relative inline-block">
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setOpen((v) => !v);
				}}
				aria-label="row menu"
				className={`rounded px-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 ${
					alwaysVisible ? "" : "opacity-0 group-hover:opacity-100"
				}`}
			>
				⋮
			</button>
			{open && (
				<div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded bg-zinc-800 shadow-lg">
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setOpen(false);
								item.onClick();
							}}
							className={`block w-full px-3 py-1 text-left text-xs hover:bg-zinc-700 ${
								item.destructive ? "text-red-300" : "text-zinc-200"
							}`}
						>
							{item.label}
						</button>
					))}
				</div>
			)}
		</span>
	);
}
