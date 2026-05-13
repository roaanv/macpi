// Top-level notes mode: list pane + editor + delete-confirm dialog.
// Manages selection, new-note creation flow, and delete confirmation.

import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useCreateNote, useDeleteNote } from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";
import { NoteEditor } from "./NoteEditor";
import { NotesList } from "./NotesList";
import { ResizablePane } from "./ResizablePane";

export function NotesMode() {
	const qc = useQueryClient();
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
		null,
	);
	const createNote = useCreateNote();
	const deleteNote = useDeleteNote();

	const onNew = () => {
		createNote.mutate(undefined, {
			onSuccess: (result) => {
				setSelectedId(result.id);
			},
		});
	};

	const onConfirmDelete = () => {
		if (!pendingDeleteId) return;
		deleteNote.mutate(
			{ id: pendingDeleteId },
			{
				onSuccess: () => {
					if (selectedId === pendingDeleteId) setSelectedId(null);
					setPendingDeleteId(null);
					qc.invalidateQueries({ queryKey: ["notes.list"] });
				},
			},
		);
	};

	return (
		<>
			<ResizablePane storageKey="notes" defaultWidth={288}>
				<NotesList
					selectedId={selectedId}
					onSelect={setSelectedId}
					onNew={onNew}
					onRequestDelete={setPendingDeleteId}
				/>
			</ResizablePane>
			<NoteEditor id={selectedId} />
			<ConfirmDialog
				open={pendingDeleteId !== null}
				title="Delete this note?"
				body="The note will be removed from NOTES.md. This can't be undone from the app."
				confirmLabel="Delete"
				destructive
				onConfirm={onConfirmDelete}
				onCancel={() => setPendingDeleteId(null)}
			/>
		</>
	);
}
