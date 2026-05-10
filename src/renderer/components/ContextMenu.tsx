// Floating context menu rendered at a screen position. Same item shape
// and visual style as RowMenu so right-click and ⋮ open the same menu.
// Outside-click and Escape close.

import React from "react";
import type { RowMenuItem } from "./RowMenu";

export interface ContextMenuProps {
	items: RowMenuItem[];
	position: { x: number; y: number } | null;
	onClose: () => void;
}

const MENU_WIDTH = 128; // w-32
const APPROX_ITEM_HEIGHT = 26;

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
	const wrapRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => {
		if (!position) return;
		const onMouseDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("mousedown", onMouseDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [position, onClose]);

	if (!position) return null;

	const menuHeight = items.length * APPROX_ITEM_HEIGHT + 4;
	const x = Math.min(position.x, window.innerWidth - MENU_WIDTH - 8);
	const y = Math.min(position.y, window.innerHeight - menuHeight - 8);

	return (
		<div
			ref={wrapRef}
			className="fixed z-50 w-32 overflow-hidden rounded surface-panel shadow-lg"
			style={{ left: x, top: y }}
		>
			{items.map((item) => (
				<button
					key={item.label}
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onClose();
						item.onClick();
					}}
					className={`block w-full px-3 py-1 text-left text-xs hover:surface-row ${
						item.destructive ? "text-red-300" : "text-primary"
					}`}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}
