// Right-pane note editor. Plain <textarea> using --font-body (prose,
// not code) — the sticky-note aesthetic. Edits debounce-autosave after
// 500ms of keyboard idle. If a save returns {ok:false,error:"stale"}
// (the file was edited outside macpi) a banner offers Reload or
// Overwrite.

import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { useNoteDetail, useSaveNote } from "../queries";

const AUTOSAVE_DEBOUNCE_MS = 500;

interface NoteEditorProps {
	id: string | null;
}

export function NoteEditor({ id }: NoteEditorProps) {
	const qc = useQueryClient();
	const detail = useNoteDetail(id);
	const save = useSaveNote();
	const [draft, setDraft] = React.useState("");
	const [staleConflict, setStaleConflict] = React.useState(false);
	const lastSavedRef = React.useRef<string>("");
	const currentIdRef = React.useRef<string | null>(null);
	currentIdRef.current = id;

	// Sync draft from server when the selected note changes.
	React.useEffect(() => {
		if (detail.data) {
			setDraft(detail.data.blob);
			lastSavedRef.current = detail.data.blob;
			setStaleConflict(false);
		}
	}, [detail.data]);

	// Debounced autosave.
	React.useEffect(() => {
		if (!id) return;
		if (draft === lastSavedRef.current) return;
		if (staleConflict) return;
		const handle = setTimeout(() => {
			const savedFor = id;
			save.mutate(
				{ id: savedFor, blob: draft },
				{
					onSuccess: (result) => {
						if (currentIdRef.current !== savedFor) return;
						if (result.ok) {
							lastSavedRef.current = draft;
						} else if (result.error === "stale") {
							setStaleConflict(true);
						}
					},
				},
			);
		}, AUTOSAVE_DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [draft, id, save, staleConflict]);

	if (!id) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Select a note or create a new one.
			</section>
		);
	}
	if (detail.isLoading) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Loading…
			</section>
		);
	}
	if (detail.isError || !detail.data) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-red-300">
				{(detail.error as Error)?.message ?? "Note not found."}
			</section>
		);
	}

	const reload = () => {
		qc.invalidateQueries({ queryKey: ["notes.list"] });
		qc.invalidateQueries({ queryKey: ["notes.read", id] });
		setStaleConflict(false);
	};
	const overwrite = () => {
		if (!id) return;
		const savedFor = id;
		save.mutate(
			{ id: savedFor, blob: draft, force: true },
			{
				onSuccess: (result) => {
					if (currentIdRef.current !== savedFor) return;
					if (result.ok) {
						lastSavedRef.current = draft;
						setStaleConflict(false);
					}
				},
			},
		);
	};

	return (
		<section className="flex flex-1 flex-col surface-panel">
			{staleConflict && (
				<div className="border-b border-divider bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
					NOTES.md changed on disk.{" "}
					<button
						type="button"
						onClick={reload}
						className="underline hover:opacity-80"
					>
						Reload
					</button>{" "}
					or{" "}
					<button
						type="button"
						onClick={overwrite}
						className="underline hover:opacity-80"
					>
						Overwrite
					</button>
					?
				</div>
			)}
			<textarea
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				placeholder="First line is the title…"
				className="flex-1 resize-none border-0 bg-transparent p-4 text-sm leading-relaxed text-primary outline-none"
				style={{ fontFamily: "var(--font-body)" }}
				spellCheck
			/>
		</section>
	);
}
