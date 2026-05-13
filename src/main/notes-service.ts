// Owns ~/.macpi/NOTES.md. Holds in-memory canonical state (preamble +
// ordered notes with stable session UUIDs + last-read mtime). Reads on
// demand, writes the whole file atomically on every mutation, and
// refuses to write if the file changed externally between read and
// save (unless the caller passes force:true).
//
// The renderer's editor displays a single text blob per note; this
// service uses notes-parser.ts helpers to round-trip between the blob
// form and the on-disk ## heading + body structure.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
	NoteDetail,
	NoteSummary,
	ParsedNote,
} from "../shared/notes-types";
import {
	blobToNote,
	noteToBlob,
	parseNotesMd,
	serialiseNotesMd,
} from "./notes-parser";

interface InMemoryNote extends ParsedNote {
	id: string;
}

export interface NotesServiceDeps {
	filePath: string;
}

export type SaveResult =
	| { ok: true; mtime: number }
	| { ok: false; error: "stale"; currentMtime: number };

export type DeleteResult = SaveResult;

export class NotesService {
	private preamble = "";
	private notes: InMemoryNote[] = [];
	private lastReadMtime = 0;

	constructor(private readonly deps: NotesServiceDeps) {}

	async list(): Promise<{
		notes: NoteSummary[];
		preamble: string;
		mtime: number;
	}> {
		this.ensureFileExists();
		// Only re-read from disk if the file has changed since our last read.
		// This preserves in-memory-only notes (e.g. a newly created but unsaved
		// note) across a list() call.
		const diskMtime = fs.statSync(this.deps.filePath).mtimeMs;
		if (diskMtime !== this.lastReadMtime) {
			this.readFromDisk();
		}
		return {
			preamble: this.preamble,
			mtime: this.lastReadMtime,
			notes: this.notes.map((n) => ({
				id: n.id,
				title: n.title,
				bodyPreview: this.preview(n.body),
				mtime: this.lastReadMtime,
			})),
		};
	}

	async read(id: string): Promise<NoteDetail> {
		const note = this.notes.find((n) => n.id === id);
		if (!note) throw new Error(`note not found: ${id}`);
		return {
			id: note.id,
			title: note.title,
			body: note.body,
			blob: noteToBlob(note),
		};
	}

	async save(input: {
		id: string;
		blob: string;
		force?: boolean;
	}): Promise<SaveResult> {
		const note = this.notes.find((n) => n.id === input.id);
		if (!note) throw new Error(`note not found: ${input.id}`);
		const parsed = blobToNote(input.blob);
		note.title = parsed.title;
		note.body = parsed.body;
		// Move the edited note to the top of the list (most-recently-edited
		// first). Drop empty notes only at serialise time so the in-memory
		// list keeps a placeholder for an open editor.
		this.notes = [note, ...this.notes.filter((n) => n.id !== input.id)];
		return this.writeToDisk(input.force ?? false);
	}

	async create(): Promise<{ id: string }> {
		this.ensureFileExists();
		this.readFromDisk();
		const id = randomUUID();
		this.notes.unshift({ id, title: "", body: "" });
		return { id };
	}

	async delete(input: { id: string; force?: boolean }): Promise<DeleteResult> {
		this.notes = this.notes.filter((n) => n.id !== input.id);
		return this.writeToDisk(input.force ?? false);
	}

	private ensureFileExists(): void {
		if (!fs.existsSync(this.deps.filePath)) {
			fs.mkdirSync(path.dirname(this.deps.filePath), { recursive: true });
			fs.writeFileSync(this.deps.filePath, "");
		}
	}

	private readFromDisk(): void {
		const content = fs.readFileSync(this.deps.filePath, "utf8");
		const parsed = parseNotesMd(content);
		this.preamble = parsed.preamble;
		this.notes = parsed.notes.map((n) => ({ ...n, id: randomUUID() }));
		this.lastReadMtime = fs.statSync(this.deps.filePath).mtimeMs;
	}

	private writeToDisk(force: boolean): SaveResult {
		if (!force && fs.existsSync(this.deps.filePath)) {
			const currentMtime = fs.statSync(this.deps.filePath).mtimeMs;
			if (currentMtime !== this.lastReadMtime) {
				return { ok: false, error: "stale", currentMtime };
			}
		}
		const text = serialiseNotesMd({
			preamble: this.preamble,
			notes: this.notes.map((n) => ({ title: n.title, body: n.body })),
		});
		fs.writeFileSync(this.deps.filePath, text);
		this.lastReadMtime = fs.statSync(this.deps.filePath).mtimeMs;
		return { ok: true, mtime: this.lastReadMtime };
	}

	private preview(body: string): string {
		const compact = body.replace(/\s+/g, " ").trim();
		return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
	}
}
