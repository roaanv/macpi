// Renderer-safe shapes for notes surfaced over IPC. NoteSummary is what
// the list pane renders; NoteDetail is what the editor pane edits.
// The `blob` field on NoteDetail is the concatenation of title + body
// that the textarea displays; parsing rules live in notes-parser.ts.

export interface NoteSummary {
	id: string;
	title: string;
	/** First ~120 chars of body, for the list pane's subtitle row. */
	bodyPreview: string;
	/** File mtime at last read. Same for every note in one snapshot;
	 * carried so the renderer can detect stale snapshots if multiple
	 * `notes.list` responses overlap. */
	mtime: number;
}

export interface NoteDetail {
	id: string;
	title: string;
	body: string;
	/** title + "\n" + body — what the editor's <textarea> renders. */
	blob: string;
}

/** Internal parser output — not crossed over IPC. */
export interface ParsedNote {
	title: string;
	body: string;
}

export interface ParseResult {
	preamble: string;
	notes: ParsedNote[];
}
