// Left-pane notes list. Header with refresh + new. Rows show title +
// body preview + hover-only trash icon. Most-recently-edited at top
// (the service guarantees that order in `notes.list`).

import { useQueryClient } from "@tanstack/react-query";
import { useNotes } from "../queries";

interface NotesListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onNew: () => void;
	onRequestDelete: (id: string) => void;
}

export function NotesList({
	selectedId,
	onSelect,
	onNew,
	onRequestDelete,
}: NotesListProps) {
	const qc = useQueryClient();
	const notes = useNotes();

	return (
		<aside className="flex h-full w-full min-w-0 flex-col surface-rail border-r border-divider">
			<div className="border-b border-divider px-3 pb-2 pt-3">
				<div className="type-overline">Notes</div>
				<div className="mt-2 flex gap-2">
					<button
						type="button"
						onClick={onNew}
						className="surface-row rounded px-2 py-1 type-control hover:opacity-80"
					>
						+ New
					</button>
					<button
						type="button"
						onClick={() => qc.invalidateQueries({ queryKey: ["notes.list"] })}
						title="Refresh from disk"
						aria-label="Refresh notes from disk"
						className="surface-row rounded px-2 py-1 type-control hover:opacity-80"
					>
						↻
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-1">
				{notes.isLoading && (
					<div className="p-2 type-status text-muted">Loading…</div>
				)}
				{notes.isError && (
					<div className="p-2 type-status text-err">
						{(notes.error as Error).message}
					</div>
				)}
				{notes.data && notes.data.notes.length === 0 && (
					<div className="p-2 type-status text-muted">
						No notes yet. + New to begin.
					</div>
				)}
				{notes.data?.notes.map((n) => {
					const active = selectedId === n.id;
					const title = n.title.trim().length > 0 ? n.title : "(untitled)";
					return (
						<div
							key={n.id}
							className={`group flex min-w-0 items-start gap-2 rounded px-2 py-1.5 ${
								active
									? "surface-row text-primary"
									: "text-muted hover:surface-row"
							}`}
						>
							<button
								type="button"
								onClick={() => onSelect(n.id)}
								className="min-w-0 flex-1 text-left"
							>
								<div className="type-label type-ellipsis">{title}</div>
								{n.bodyPreview && (
									<div className="type-metadata type-ellipsis text-faint">
										{n.bodyPreview}
									</div>
								)}
							</button>
							<button
								type="button"
								onClick={() => onRequestDelete(n.id)}
								title="Delete note"
								aria-label={`Delete ${title}`}
								className="rounded px-1 type-control text-faint opacity-0 transition-opacity hover:text-err group-hover:opacity-100"
							>
								🗑
							</button>
						</div>
					);
				})}
			</div>
		</aside>
	);
}
