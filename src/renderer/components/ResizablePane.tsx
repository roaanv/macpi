// Renders children inside a fixed-width column with a vertical drag
// handle on its right edge. Width is persisted per-pane to localStorage
// so each mode (skills, extensions, prompts) keeps its own preferred
// size across reloads.

import React from "react";

interface ResizablePaneProps {
	/** Unique key under "macpi:pane-width:" for localStorage persistence. */
	storageKey: string;
	defaultWidth: number;
	minWidth?: number;
	maxWidth?: number;
	children: React.ReactNode;
}

const STORAGE_PREFIX = "macpi:pane-width:";

function readPersisted(
	key: string,
	fallback: number,
	min: number,
	max: number,
): number {
	try {
		const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
		if (!raw) return fallback;
		const n = Number.parseInt(raw, 10);
		if (!Number.isFinite(n)) return fallback;
		return Math.min(Math.max(n, min), max);
	} catch {
		return fallback;
	}
}

export function ResizablePane({
	storageKey,
	defaultWidth,
	minWidth = 180,
	maxWidth = 600,
	children,
}: ResizablePaneProps) {
	const [width, setWidth] = React.useState<number>(() =>
		readPersisted(storageKey, defaultWidth, minWidth, maxWidth),
	);
	const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(
		null,
	);

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		dragRef.current = { startX: e.clientX, startWidth: width };
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		const delta = e.clientX - dragRef.current.startX;
		const next = Math.min(
			Math.max(dragRef.current.startWidth + delta, minWidth),
			maxWidth,
		);
		setWidth(next);
	};

	const persist = React.useCallback(
		(value: number) => {
			try {
				window.localStorage.setItem(
					`${STORAGE_PREFIX}${storageKey}`,
					String(value),
				);
			} catch {
				// localStorage can be disabled — failing silently is fine here.
			}
		},
		[storageKey],
	);

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		dragRef.current = null;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// Pointer capture may already have been released by the browser.
		}
		persist(width);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
		e.preventDefault();
		const step = e.shiftKey ? 24 : 8;
		const direction = e.key === "ArrowLeft" ? -1 : 1;
		const next = Math.min(
			Math.max(width + direction * step, minWidth),
			maxWidth,
		);
		setWidth(next);
		persist(next);
	};

	return (
		<div className="relative flex h-full flex-shrink-0" style={{ width }}>
			<div className="flex h-full w-full min-w-0">{children}</div>
			{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA's window-splitter
				pattern uses an interactive role="separator" on a div; <hr> doesn't
				accept the pointer/keyboard handlers needed for drag-to-resize. */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize pane"
				aria-valuenow={width}
				aria-valuemin={minWidth}
				aria-valuemax={maxWidth}
				tabIndex={0}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onKeyDown={onKeyDown}
				className="absolute right-0 top-0 h-full w-1 cursor-col-resize outline-none hover:bg-indigo-500/50 focus-visible:bg-indigo-500/50 active:bg-indigo-500/70"
			/>
		</div>
	);
}
