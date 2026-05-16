// Right-side pane in chat mode. Owns:
//   - selectedPath: which file is highlighted in the tree and rendered
//     in the preview.
//   - selectedSizeBytes: tracked from the FileEntry that was clicked so
//     FilePreview can short-circuit the >1MB case without a round trip.
//   - expandedPaths: which folders are open (in-memory per pane mount;
//     resets when piSessionId changes).
//   - showHidden: a session-scoped toggle that exposes dotfiles and
//     IGNORED_NAMES entries.
//   - splitPct: top sub-pane height as a percentage (persisted to
//     localStorage so it survives reloads).
//
// Refresh: subscribes to pi events for the active session via
// useInvalidateOnTurnEnd and invalidates BOTH query prefixes
// (files.listDir, files.readText) on every turn_end / compaction_end.

import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import type { FileEntry } from "../../shared/ipc-types";
import { useInvalidateOnTurnEnd } from "../queries";
import { FilePreview } from "./FilePreview";
import { FileTree } from "./FileTree";
import { ResizablePane } from "./ResizablePane";

const SPLIT_STORAGE_KEY = "macpi:pane-height:files-tree";
const DEFAULT_SPLIT_PCT = 50;
const MIN_SPLIT_PCT = 20;
const MAX_SPLIT_PCT = 80;

function readSplit(): number {
	try {
		const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY);
		if (!raw) return DEFAULT_SPLIT_PCT;
		const n = Number.parseFloat(raw);
		if (!Number.isFinite(n)) return DEFAULT_SPLIT_PCT;
		return Math.min(Math.max(n, MIN_SPLIT_PCT), MAX_SPLIT_PCT);
	} catch {
		return DEFAULT_SPLIT_PCT;
	}
}

function writeSplit(pct: number) {
	try {
		window.localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
	} catch {
		// localStorage may be disabled.
	}
}

export function FileBrowserPane({
	piSessionId,
	sessionCwd,
	onClose,
}: {
	piSessionId: string;
	sessionCwd: string | null;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
	const [selectedSizeBytes, setSelectedSizeBytes] = React.useState<number>(0);
	const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
		() => new Set(),
	);
	const [showHidden, setShowHidden] = React.useState(false);
	const [splitPct, setSplitPct] = React.useState<number>(() => readSplit());

	// Reset everything when the session changes — the tree is rooted at the
	// new cwd and the old selection is meaningless.
	// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is the trigger; setters are stable
	React.useEffect(() => {
		setSelectedPath(null);
		setSelectedSizeBytes(0);
		setExpandedPaths(new Set());
	}, [piSessionId]);

	// Refresh both query prefixes after every pi turn. The list-dir queries
	// share a prefix tuple so one invalidate covers every depth.
	useInvalidateOnTurnEnd(piSessionId, ["files.listDir", piSessionId]);
	useInvalidateOnTurnEnd(piSessionId, ["files.readText", piSessionId]);

	const onToggleExpand = React.useCallback((relPath: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(relPath)) next.delete(relPath);
			else next.add(relPath);
			return next;
		});
	}, []);

	const onSelectFile = React.useCallback((entry: FileEntry) => {
		setSelectedPath(entry.relPath);
		setSelectedSizeBytes(entry.sizeBytes);
	}, []);

	const refreshAll = React.useCallback(() => {
		qc.invalidateQueries({ queryKey: ["files.listDir", piSessionId] });
		qc.invalidateQueries({ queryKey: ["files.readText", piSessionId] });
	}, [qc, piSessionId]);

	const splitDragRef = React.useRef<{
		startY: number;
		startPct: number;
		containerH: number;
	} | null>(null);

	const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		// The splitter sits inside the inner flex-col that holds header /
		// tree / splitter / preview. That column's height is the canvas the
		// split percentage divides — read it directly via parentElement.
		const containerEl = e.currentTarget.parentElement as HTMLElement | null;
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		splitDragRef.current = {
			startY: e.clientY,
			startPct: splitPct,
			containerH: rect.height,
		};
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};
	const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!splitDragRef.current) return;
		const { startY, startPct, containerH } = splitDragRef.current;
		const deltaPct = ((e.clientY - startY) / containerH) * 100;
		const next = Math.min(
			Math.max(startPct + deltaPct, MIN_SPLIT_PCT),
			MAX_SPLIT_PCT,
		);
		setSplitPct(next);
	};
	const onSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!splitDragRef.current) return;
		splitDragRef.current = null;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// already released
		}
		writeSplit(splitPct);
	};

	const body = !sessionCwd ? (
		<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
			This session has no working directory.
		</div>
	) : (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-1 border-b border-white/5 px-2 py-1 text-xs">
				<span className="truncate text-muted" title={sessionCwd}>
					{sessionCwd}
				</span>
				<div className="ml-auto flex items-center gap-1">
					<label className="flex items-center gap-1 text-muted">
						<input
							type="checkbox"
							checked={showHidden}
							onChange={(e) => setShowHidden(e.target.checked)}
						/>
						hidden
					</label>
					<button
						type="button"
						onClick={refreshAll}
						className="rounded px-1 hover:bg-white/5"
						title="Refresh"
					>
						⟳
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-1 hover:bg-white/5"
						title="Close pane"
					>
						✕
					</button>
				</div>
			</div>
			{/* Tree */}
			<div className="overflow-auto" style={{ height: `${splitPct}%` }}>
				<FileTree
					piSessionId={piSessionId}
					relPath=""
					depth={0}
					showHidden={showHidden}
					expandedPaths={expandedPaths}
					selectedPath={selectedPath}
					onToggleExpand={onToggleExpand}
					onSelect={onSelectFile}
				/>
			</div>
			{/* Horizontal splitter */}
			{/* biome-ignore lint/a11y/useSemanticElements: same rationale as ResizablePane */}
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize tree / preview split"
				aria-valuenow={splitPct}
				aria-valuemin={MIN_SPLIT_PCT}
				aria-valuemax={MAX_SPLIT_PCT}
				tabIndex={0}
				onPointerDown={onSplitPointerDown}
				onPointerMove={onSplitPointerMove}
				onPointerUp={onSplitPointerUp}
				onPointerCancel={onSplitPointerUp}
				className="h-1 w-full cursor-row-resize bg-white/5 hover:bg-indigo-500/50 active:bg-indigo-500/70"
			/>
			{/* Preview */}
			<div
				className="min-h-0 flex-1 overflow-hidden"
				style={{ height: `${100 - splitPct}%` }}
			>
				<FilePreview
					piSessionId={piSessionId}
					selectedPath={selectedPath}
					sizeBytes={selectedSizeBytes}
				/>
			</div>
		</div>
	);

	return (
		<ResizablePane
			storageKey="files"
			defaultWidth={320}
			minWidth={240}
			maxWidth={720}
			side="left"
		>
			<div className="flex h-full w-full flex-col border-l border-white/5 bg-black/10">
				{body}
			</div>
		</ResizablePane>
	);
}
