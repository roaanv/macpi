// Recursive file tree. Purely controlled — all state (which folders are
// expanded, which file is selected) lives in FileBrowserPane and is
// passed in. That lets refresh re-render without unmounting children,
// and means a fork could share state with another tree.
//
// Rendering rules from the spec:
//   - Dirs first, then files, alpha within each group (FilesService sorts).
//   - Non-text files at 50% opacity, not selectable.
//   - Folder rows show ▸ / ▾ toggle.
//   - Indent is 12px per depth level.

import type React from "react";
import type { FileEntry } from "../../shared/ipc-types";
import { useDirListing } from "../queries";

interface FileTreeProps {
	piSessionId: string;
	relPath: string;
	depth: number;
	showHidden: boolean;
	expandedPaths: ReadonlySet<string>;
	selectedPath: string | null;
	onToggleExpand: (relPath: string) => void;
	onSelect: (entry: FileEntry) => void;
}

export function FileTree(props: FileTreeProps) {
	const {
		piSessionId,
		relPath,
		depth,
		showHidden,
		expandedPaths,
		selectedPath,
		onToggleExpand,
		onSelect,
	} = props;
	const query = useDirListing(piSessionId, relPath, showHidden);

	if (query.isLoading) {
		return (
			<div
				className="px-2 py-1 text-xs text-muted"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				Loading…
			</div>
		);
	}
	if (query.isError) {
		const code = (query.error as { code?: string } | null)?.code;
		const msg =
			code === "permission_denied"
				? "(no permission)"
				: code === "not_found"
					? "(missing)"
					: code === "path_outside_cwd"
						? "(blocked)"
						: "(error)";
		return (
			<div
				className="px-2 py-1 text-xs text-red-300"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				{msg}
			</div>
		);
	}
	const entries = query.data?.entries ?? [];
	if (entries.length === 0 && depth > 0) {
		return (
			<div
				className="px-2 py-1 text-xs text-muted"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				(empty)
			</div>
		);
	}

	return (
		<>
			{entries.map((entry) =>
				entry.kind === "dir" ? (
					<DirRow
						key={entry.relPath}
						entry={entry}
						depth={depth}
						isExpanded={expandedPaths.has(entry.relPath)}
						onToggle={() => onToggleExpand(entry.relPath)}
					>
						{expandedPaths.has(entry.relPath) && (
							<FileTree
								piSessionId={piSessionId}
								relPath={entry.relPath}
								depth={depth + 1}
								showHidden={showHidden}
								expandedPaths={expandedPaths}
								selectedPath={selectedPath}
								onToggleExpand={onToggleExpand}
								onSelect={onSelect}
							/>
						)}
					</DirRow>
				) : (
					<FileRow
						key={entry.relPath}
						entry={entry}
						depth={depth}
						isSelected={entry.relPath === selectedPath}
						onSelect={() => entry.isText && onSelect(entry)}
					/>
				),
			)}
		</>
	);
}

function DirRow({
	entry,
	depth,
	isExpanded,
	onToggle,
	children,
}: {
	entry: FileEntry;
	depth: number;
	isExpanded: boolean;
	onToggle: () => void;
	children?: React.ReactNode;
}) {
	return (
		<>
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs hover:bg-white/5"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				<span className="inline-block w-3 text-muted">
					{isExpanded ? "▾" : "▸"}
				</span>
				<span>{entry.name}</span>
			</button>
			{children}
		</>
	);
}

function FileRow({
	entry,
	depth,
	isSelected,
	onSelect,
}: {
	entry: FileEntry;
	depth: number;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const className = [
		"flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs",
		entry.isText ? "hover:bg-white/5" : "opacity-50 cursor-default",
		isSelected ? "bg-indigo-500/20" : "",
	].join(" ");
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={!entry.isText}
			className={className}
			style={{ paddingLeft: depth * 12 + 8 + 12 /* align past ▸ */ }}
		>
			<span>{entry.name}</span>
		</button>
	);
}
