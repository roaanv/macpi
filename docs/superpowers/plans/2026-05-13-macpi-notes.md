# macpi Notes Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "sticky note"-style quick-capture mode to macpi backed by a single `~/.macpi/NOTES.md` file (the sole source of truth, hand-editable outside the app).

**Architecture:** Three layers. (1) Main-process `NotesService` owns disk I/O for NOTES.md, with parse/serialise extracted as pure helpers in `notes-parser.ts` for unit testability. (2) Five new IPC methods (`notes.list/read/save/create/delete`) plumbed through the existing IPC router. (3) Renderer adds a new mode-rail entry (📝) routed to `NotesMode`, which composes `NotesList` + `NoteEditor` with debounced autosave and mtime-based stale-edit detection.

**Tech Stack:** TypeScript, Node `node:fs`/`node:path`, Electron IPC (already wired), React 18 + TanStack Query (existing patterns), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-13-macpi-notes-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/shared/notes-types.ts` | `NoteSummary`, `NoteDetail`, parser data types |
| Create | `src/main/notes-parser.ts` | Pure: `parseNotesMd`, `serialiseNotesMd`, `blobToNote`, `noteToBlob` |
| Create | `src/main/notes-service.ts` | NotesService class — owns NOTES.md, mtime tracking, list/read/save/create/delete |
| Modify | `src/shared/ipc-types.ts` | Add 5 method signatures |
| Modify | `src/main/ipc-router.ts` | Wire NotesService handlers |
| Modify | `src/main/index.ts` | Instantiate NotesService, pass to router |
| Modify | `src/renderer/queries.ts` | Add 5 hooks |
| Create | `src/renderer/components/NotesList.tsx` | Left pane: list + refresh + new + hover-trash |
| Create | `src/renderer/components/NoteEditor.tsx` | Right pane: textarea + autosave + stale banner |
| Create | `src/renderer/components/NotesMode.tsx` | Container: composes list + editor + ConfirmDialog |
| Modify | `src/renderer/components/ModeRail.tsx` | Add 📝 entry |
| Modify | `src/renderer/App.tsx` | Route `mode === "notes"` to `NotesMode` |
| Create | `tests/unit/notes-parser.test.ts` | 11 unit tests (pure parser/serialiser) |
| Create | `tests/integration/notes-service.test.ts` | 7 integration tests (real disk via tmpdir) |

---

## Task 1: Shared types

**Files:**
- Create: `src/shared/notes-types.ts`

- [ ] **Step 1: Create the types file**

Write `src/shared/notes-types.ts`:

```ts
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/notes-types.ts
git commit -m "$(cat <<'EOF'
feat(notes): shared types for note summary + detail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Parser — parseNotesMd + serialiseNotesMd + blob helpers

**Files:**
- Create: `src/main/notes-parser.ts`
- Create: `tests/unit/notes-parser.test.ts`

- [ ] **Step 1: Write the failing unit test file (TDD — full suite first)**

Write `tests/unit/notes-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	blobToNote,
	noteToBlob,
	parseNotesMd,
	serialiseNotesMd,
} from "../../src/main/notes-parser";

describe("parseNotesMd", () => {
	it("returns zero notes for empty file", () => {
		expect(parseNotesMd("")).toEqual({ preamble: "", notes: [] });
	});

	it("preserves preamble-only file as preamble, zero notes", () => {
		const text = "# my notes\n\nfree-form intro\n";
		expect(parseNotesMd(text)).toEqual({ preamble: text, notes: [] });
	});

	it("parses a single note with body", () => {
		const text = "## first\nbody line one\nbody line two\n";
		expect(parseNotesMd(text)).toEqual({
			preamble: "",
			notes: [{ title: "first", body: "body line one\nbody line two" }],
		});
	});

	it("parses a single note with no body", () => {
		expect(parseNotesMd("## title only\n")).toEqual({
			preamble: "",
			notes: [{ title: "title only", body: "" }],
		});
	});

	it("parses multiple notes in order", () => {
		const text = "## one\nbody one\n## two\nbody two\n## three\nbody three\n";
		expect(parseNotesMd(text).notes).toEqual([
			{ title: "one", body: "body one" },
			{ title: "two", body: "body two" },
			{ title: "three", body: "body three" },
		]);
	});

	it("treats h3+ sub-headings inside body as body content", () => {
		const text = "## outer\n### nested\nstuff under nested\n## next\n";
		expect(parseNotesMd(text).notes).toEqual([
			{ title: "outer", body: "### nested\nstuff under nested" },
			{ title: "next", body: "" },
		]);
	});

	it("preserves preamble before the first ## note", () => {
		const text = "intro line\n\n## first\nbody\n";
		expect(parseNotesMd(text)).toEqual({
			preamble: "intro line\n\n",
			notes: [{ title: "first", body: "body" }],
		});
	});

	it("normalises CRLF input to LF for body content", () => {
		const text = "## title\r\nbody one\r\nbody two\r\n";
		expect(parseNotesMd(text).notes[0]).toEqual({
			title: "title",
			body: "body one\nbody two",
		});
	});

	it("trims trailing whitespace from heading lines", () => {
		expect(parseNotesMd("## title  \nbody\n").notes[0].title).toBe("title");
	});
});

describe("serialiseNotesMd", () => {
	it("emits empty string for empty input", () => {
		expect(serialiseNotesMd({ preamble: "", notes: [] })).toBe("");
	});

	it("preserves preamble verbatim", () => {
		const result = serialiseNotesMd({
			preamble: "# header\n\nintro\n\n",
			notes: [],
		});
		expect(result).toBe("# header\n\nintro\n\n");
	});

	it("emits a single note as ## heading + body + trailing blank line", () => {
		expect(
			serialiseNotesMd({
				preamble: "",
				notes: [{ title: "first", body: "body line" }],
			}),
		).toBe("## first\nbody line\n\n");
	});

	it("drops notes with empty title AND empty body", () => {
		expect(
			serialiseNotesMd({
				preamble: "",
				notes: [
					{ title: "real", body: "real body" },
					{ title: "", body: "" },
					{ title: "second", body: "" },
				],
			}),
		).toBe("## real\nreal body\n\n## second\n\n");
	});

	it("round-trips: parse(serialise(x)) === x for representative input", () => {
		const original = {
			preamble: "# notes\n\n",
			notes: [
				{ title: "alpha", body: "alpha body\nmore" },
				{ title: "beta", body: "beta body" },
				{ title: "gamma", body: "" },
			],
		};
		const text = serialiseNotesMd(original);
		expect(parseNotesMd(text)).toEqual(original);
	});
});

describe("blobToNote / noteToBlob", () => {
	it("blobToNote: first non-empty line is title, rest is body", () => {
		expect(blobToNote("title here\nbody one\nbody two")).toEqual({
			title: "title here",
			body: "body one\nbody two",
		});
	});

	it("blobToNote: title-only blob has empty body", () => {
		expect(blobToNote("just a title")).toEqual({
			title: "just a title",
			body: "",
		});
	});

	it("blobToNote: leading blank lines are stripped before finding title", () => {
		expect(blobToNote("\n\n  \nactual title\nbody")).toEqual({
			title: "actual title",
			body: "body",
		});
	});

	it("blobToNote: strips a leading `## ` prefix from the title line", () => {
		expect(blobToNote("## already-prefixed\nbody")).toEqual({
			title: "already-prefixed",
			body: "body",
		});
	});

	it("blobToNote: all-whitespace blob returns empty note", () => {
		expect(blobToNote("   \n\n  \n")).toEqual({ title: "", body: "" });
	});

	it("noteToBlob: title + newline + body", () => {
		expect(noteToBlob({ title: "t", body: "b\nc" })).toBe("t\nb\nc");
	});

	it("noteToBlob: title-only note has no trailing newline", () => {
		expect(noteToBlob({ title: "t", body: "" })).toBe("t");
	});

	it("round-trip: noteToBlob(blobToNote(s)) preserves user content", () => {
		const original = "my title\nfirst body line\nsecond body line";
		expect(noteToBlob(blobToNote(original))).toBe(original);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/notes-parser.test.ts`
Expected: all tests fail with module-not-found error for `../../src/main/notes-parser`.

- [ ] **Step 3: Implement the parser**

Write `src/main/notes-parser.ts`:

```ts
// Pure functions for converting between NOTES.md text and the in-memory
// note list. No I/O — the service layer owns disk operations and uses
// these helpers to round-trip content. Heavily unit-tested.
//
// File format:
//   <preamble — anything before the first ^## line, retained verbatim>
//   ## <title>
//   <body — everything up to next ^## or EOF, sub-headings included>
//   ## <next title>
//   ...

import type { ParseResult, ParsedNote } from "../shared/notes-types";

const NOTE_HEADING = /^## (.*)$/;

/** Parse NOTES.md text into a preamble + ordered note list. */
export function parseNotesMd(text: string): ParseResult {
	const normalised = text.replace(/\r\n/g, "\n");
	const lines = normalised.split("\n");
	const notes: ParsedNote[] = [];
	let preambleLines: string[] = [];
	let currentTitle: string | null = null;
	let currentBody: string[] = [];

	const flushCurrent = () => {
		if (currentTitle !== null) {
			notes.push({
				title: currentTitle,
				body: currentBody.join("\n").replace(/\n+$/, ""),
			});
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const match = line.match(NOTE_HEADING);
		if (match) {
			flushCurrent();
			currentTitle = (match[1] ?? "").trimEnd();
			currentBody = [];
			continue;
		}
		if (currentTitle === null) {
			preambleLines.push(line);
		} else {
			currentBody.push(line);
		}
	}
	flushCurrent();

	// Reconstruct preamble: join lines back with \n; trailing newline if
	// the original input ended with one and we had preamble content.
	let preamble = preambleLines.join("\n");
	// If the file is preamble-only, trim trailing empty token added by
	// the final split, but only if the original ended with \n.
	if (currentTitle === null && normalised.endsWith("\n")) {
		preamble = preamble.replace(/\n?$/, "\n");
	}
	return { preamble, notes };
}

/** Serialise a preamble + note list back to NOTES.md text. */
export function serialiseNotesMd(input: ParseResult): string {
	const { preamble, notes } = input;
	const kept = notes.filter((n) => n.title !== "" || n.body !== "");
	const body = kept
		.map((n) => `## ${n.title}\n${n.body}${n.body === "" ? "" : "\n"}\n`)
		.join("");
	return preamble + body;
}

/** Convert the editor's text blob into a parsed note.
 *
 * Rules:
 *   - Skip leading blank/whitespace-only lines.
 *   - First non-empty line is the title (after stripping an optional
 *     `## ` prefix the user may have typed).
 *   - Everything after that first line is the body, verbatim.
 *   - All-whitespace blob → empty note { title: "", body: "" }.
 */
export function blobToNote(blob: string): ParsedNote {
	const normalised = blob.replace(/\r\n/g, "\n");
	const lines = normalised.split("\n");
	let titleIndex = -1;
	for (let i = 0; i < lines.length; i++) {
		if ((lines[i] ?? "").trim().length > 0) {
			titleIndex = i;
			break;
		}
	}
	if (titleIndex === -1) {
		return { title: "", body: "" };
	}
	let title = (lines[titleIndex] ?? "").replace(/^## /, "").trimEnd();
	const body = lines.slice(titleIndex + 1).join("\n");
	return { title, body };
}

/** Convert a parsed note back to the editor's text blob. */
export function noteToBlob(note: ParsedNote): string {
	if (note.body === "") return note.title;
	return `${note.title}\n${note.body}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/notes-parser.test.ts`
Expected: all 19 tests pass.

- [ ] **Step 5: Run biome + typecheck**

Run: `npx biome check src/main/notes-parser.ts tests/unit/notes-parser.test.ts && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/notes-parser.ts tests/unit/notes-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(notes): pure parser + serialiser + blob conversion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: NotesService — file I/O with mtime-stale detection

**Files:**
- Create: `src/main/notes-service.ts`
- Create: `tests/integration/notes-service.test.ts`

- [ ] **Step 1: Write the failing integration test**

Write `tests/integration/notes-service.test.ts`:

```ts
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotesService } from "../../src/main/notes-service";

describe("NotesService", () => {
	let dir: string;
	let filePath: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-notes-"));
		filePath = path.join(dir, "NOTES.md");
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("creates an empty NOTES.md on first list when missing", async () => {
		const svc = new NotesService({ filePath });
		const result = await svc.list();
		expect(result.notes).toEqual([]);
		expect(result.preamble).toBe("");
		expect(existsSync(filePath)).toBe(true);
		expect(readFileSync(filePath, "utf8")).toBe("");
	});

	it("round-trips create → save → read → list", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		const save = await svc.save({
			id,
			blob: "hello\nbody here\nmore body",
		});
		expect(save.ok).toBe(true);

		const detail = await svc.read(id);
		expect(detail.title).toBe("hello");
		expect(detail.body).toBe("body here\nmore body");
		expect(detail.blob).toBe("hello\nbody here\nmore body");

		const listed = await svc.list();
		expect(listed.notes).toHaveLength(1);
		expect(listed.notes[0]?.title).toBe("hello");
	});

	it("save returns {ok:false,error:stale} when file changed externally", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		await svc.save({ id, blob: "first" });

		// Simulate an external edit by bumping mtime in the future.
		const future = new Date(Date.now() + 5000);
		utimesSync(filePath, future, future);

		const result = await svc.save({ id, blob: "second" });
		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.error).toBe("stale");
		}
	});

	it("save with {force:true} bypasses the stale check", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		await svc.save({ id, blob: "first" });

		const future = new Date(Date.now() + 5000);
		utimesSync(filePath, future, future);

		const result = await svc.save({ id, blob: "forced", force: true });
		expect(result.ok).toBe(true);
		const detail = await svc.read(id);
		expect(detail.title).toBe("forced");
	});

	it("delete removes the section but preserves preamble + other notes", async () => {
		writeFileSync(
			filePath,
			"# header\n\n## first\nbody one\n\n## second\nbody two\n",
		);
		const svc = new NotesService({ filePath });
		const listed = await svc.list();
		const firstId = listed.notes[0]?.id;
		if (!firstId) throw new Error("expected first note id");

		const result = await svc.delete({ id: firstId });
		expect(result.ok).toBe(true);

		const after = await svc.list();
		expect(after.notes).toHaveLength(1);
		expect(after.notes[0]?.title).toBe("second");
		expect(after.preamble).toBe("# header\n\n");
	});

	it("most-recently-edited note moves to position 0", async () => {
		writeFileSync(filePath, "## one\nbody one\n## two\nbody two\n");
		const svc = new NotesService({ filePath });
		const listed = await svc.list();
		const secondId = listed.notes[1]?.id;
		if (!secondId) throw new Error("expected second note id");

		await svc.save({ id: secondId, blob: "two-edited\nnew body" });

		const after = await svc.list();
		expect(after.notes[0]?.title).toBe("two-edited");
		expect(after.notes[1]?.title).toBe("one");
	});

	it("creates an empty note that disappears unless saved with content", async () => {
		const svc = new NotesService({ filePath });
		await svc.create();
		const listed = await svc.list();
		// The in-memory list has the empty note for immediate selection,
		// but the file on disk does not yet contain it.
		expect(listed.notes).toHaveLength(1);
		expect(readFileSync(filePath, "utf8")).toBe("");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/integration/notes-service.test.ts`
Expected: all tests fail with module-not-found.

- [ ] **Step 3: Implement NotesService**

Write `src/main/notes-service.ts`:

```ts
// Owns ~/.macpi/NOTES.md. Holds in-memory canonical state (preamble +
// ordered notes with stable session UUIDs + last-read mtime). Reads on
// demand, writes the whole file atomically on every mutation, and
// refuses to write if the file changed externally between read and
// save (unless the caller passes force:true).
//
// The renderer's editor displays a single text blob per note; this
// service uses notes-parser.ts helpers to convert between the blob
// form and the on-disk ## heading + body structure.

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
	blobToNote,
	noteToBlob,
	parseNotesMd,
	serialiseNotesMd,
} from "./notes-parser";
import type {
	NoteDetail,
	NoteSummary,
	ParsedNote,
} from "../shared/notes-types";

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
	private preamble: string = "";
	private notes: InMemoryNote[] = [];
	private lastReadMtime = 0;

	constructor(private readonly deps: NotesServiceDeps) {}

	async list(): Promise<{
		notes: NoteSummary[];
		preamble: string;
		mtime: number;
	}> {
		this.ensureFileExists();
		this.readFromDisk();
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

	async delete(input: {
		id: string;
		force?: boolean;
	}): Promise<DeleteResult> {
		this.notes = this.notes.filter((n) => n.id !== input.id);
		return this.writeToDisk(input.force ?? false);
	}

	private ensureFileExists(): void {
		if (!fs.existsSync(this.deps.filePath)) {
			fs.mkdirSync(require("node:path").dirname(this.deps.filePath), {
				recursive: true,
			});
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/notes-service.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Run biome + typecheck**

Run: `npx biome check src/main/notes-service.ts tests/integration/notes-service.test.ts && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/notes-service.ts tests/integration/notes-service.test.ts
git commit -m "$(cat <<'EOF'
feat(notes): NotesService with mtime stale detection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: IPC plumbing — types + router + main bootstrap

**Files:**
- Modify: `src/shared/ipc-types.ts`
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add 5 method signatures to `src/shared/ipc-types.ts`**

Find the `IpcMethods` interface (or equivalent type defining all methods) and add these entries alongside the existing `skills.*` / `prompts.*` / `extensions.*` blocks. The exact shape uses the existing project convention `{ req: ...; res: ... }`:

```ts
"notes.list": {
    req: Record<string, never>;
    res: {
        notes: NoteSummary[];
        preamble: string;
        mtime: number;
    };
};
"notes.read": {
    req: { id: string };
    res: NoteDetail;
};
"notes.save": {
    req: { id: string; blob: string; force?: boolean };
    res:
        | { ok: true; mtime: number }
        | { ok: false; error: "stale"; currentMtime: number };
};
"notes.create": {
    req: Record<string, never>;
    res: { id: string };
};
"notes.delete": {
    req: { id: string; force?: boolean };
    res:
        | { ok: true; mtime: number }
        | { ok: false; error: "stale"; currentMtime: number };
};
```

Add the import at the top:

```ts
import type { NoteDetail, NoteSummary } from "./notes-types";
```

- [ ] **Step 2: Wire NotesService into `src/main/ipc-router.ts`**

Add to the top imports:

```ts
import type { NotesService } from "./notes-service";
```

Add `notesService: NotesService` to the router's `Deps` (or constructor input) alongside `skillsService`, `extensionsService`, `promptsService`. Then add five new handler cases following the same pattern used by the other services. Example for `notes.list`:

```ts
case "notes.list":
    return this.deps.notesService.list();
case "notes.read":
    return this.deps.notesService.read(args.id);
case "notes.save":
    return this.deps.notesService.save(args);
case "notes.create":
    return this.deps.notesService.create();
case "notes.delete":
    return this.deps.notesService.delete(args);
```

(Match the exact `case` style used by the router — some projects use a switch, others a method-name lookup table. Mirror what's there.)

- [ ] **Step 3: Instantiate NotesService in `src/main/index.ts`**

Add import near the other service imports:

```ts
import { NotesService } from "./notes-service";
```

After `appSettings` is constructed and the resource root is resolved (you already have `macpiRoot` from the npm-prefix wiring), add:

```ts
const notesService = new NotesService({
    filePath: path.join(macpiRoot, "NOTES.md"),
});
```

Pass `notesService` to the `IpcRouter` constructor in the same place the other services are passed.

- [ ] **Step 4: Typecheck + biome**

Run: `npx tsc --noEmit && npx biome check src/shared/ipc-types.ts src/main/ipc-router.ts src/main/index.ts`
Expected: clean.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests still pass (integration tests of NotesService already exist; nothing else should regress).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc-types.ts src/main/ipc-router.ts src/main/index.ts
git commit -m "$(cat <<'EOF'
feat(notes): wire NotesService through IPC + bootstrap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Renderer query hooks

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add 5 hooks to queries.ts**

Add this block alongside the existing `usePrompts` / `useSavePrompt` etc. patterns:

```ts
export function useNotes() {
    return useQuery({
        queryKey: ["notes.list"],
        queryFn: () => invoke("notes.list", {}),
    });
}

export function useNoteDetail(id: string | null) {
    return useQuery({
        queryKey: ["notes.read", id],
        queryFn: () =>
            id
                ? invoke("notes.read", { id })
                : Promise.reject(new Error("no id")),
        enabled: id !== null,
    });
}

export function useSaveNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; blob: string; force?: boolean }) =>
            invoke("notes.save", input),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ["notes.list"] });
            qc.invalidateQueries({ queryKey: ["notes.read", vars.id] });
        },
    });
}

export function useCreateNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => invoke("notes.create", {}),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes.list"] });
        },
    });
}

export function useDeleteNote() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { id: string; force?: boolean }) =>
            invoke("notes.delete", input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["notes.list"] });
        },
    });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Biome**

Run: `npx biome check src/renderer/queries.ts`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "$(cat <<'EOF'
feat(notes): renderer query hooks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: NotesList component

**Files:**
- Create: `src/renderer/components/NotesList.tsx`

- [ ] **Step 1: Create the list component**

Write `src/renderer/components/NotesList.tsx`:

```tsx
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
				<div className="text-xs font-semibold uppercase tracking-wide text-muted">
					Notes
				</div>
				<div className="mt-2 flex gap-2">
					<button
						type="button"
						onClick={onNew}
						className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
					>
						+ New
					</button>
					<button
						type="button"
						onClick={() =>
							qc.invalidateQueries({ queryKey: ["notes.list"] })
						}
						title="Refresh from disk"
						aria-label="Refresh notes from disk"
						className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
					>
						↻
					</button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto p-1">
				{notes.isLoading && (
					<div className="p-2 text-xs text-muted">Loading…</div>
				)}
				{notes.isError && (
					<div className="p-2 text-xs text-red-300">
						{(notes.error as Error).message}
					</div>
				)}
				{notes.data && notes.data.notes.length === 0 && (
					<div className="p-2 text-xs text-muted">
						No notes yet. + New to begin.
					</div>
				)}
				{notes.data?.notes.map((n) => {
					const active = selectedId === n.id;
					const title = n.title.trim().length > 0 ? n.title : "(untitled)";
					return (
						<div
							key={n.id}
							className={`group flex items-start gap-2 rounded px-2 py-1.5 text-sm ${
								active
									? "surface-row text-primary"
									: "text-muted hover:surface-row"
							}`}
						>
							<button
								type="button"
								onClick={() => onSelect(n.id)}
								className="flex-1 overflow-hidden text-left"
							>
								<div className="truncate font-medium">{title}</div>
								{n.bodyPreview && (
									<div className="truncate text-xs text-faint">
										{n.bodyPreview}
									</div>
								)}
							</button>
							<button
								type="button"
								onClick={() => onRequestDelete(n.id)}
								title="Delete note"
								aria-label={`Delete ${title}`}
								className="opacity-0 transition-opacity group-hover:opacity-100 rounded px-1 text-xs text-faint hover:text-red-400"
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
```

- [ ] **Step 2: Typecheck + biome**

Run: `npx tsc --noEmit && npx biome check src/renderer/components/NotesList.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/NotesList.tsx
git commit -m "$(cat <<'EOF'
feat(notes): NotesList left pane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: NoteEditor component

**Files:**
- Create: `src/renderer/components/NoteEditor.tsx`

- [ ] **Step 1: Create the editor component**

Write `src/renderer/components/NoteEditor.tsx`:

```tsx
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
			save.mutate(
				{ id, blob: draft },
				{
					onSuccess: (result) => {
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
		save.mutate(
			{ id, blob: draft, force: true },
			{
				onSuccess: (result) => {
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
```

- [ ] **Step 2: Typecheck + biome**

Run: `npx tsc --noEmit && npx biome check src/renderer/components/NoteEditor.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/NoteEditor.tsx
git commit -m "$(cat <<'EOF'
feat(notes): NoteEditor with debounced autosave + stale banner

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: NotesMode container

**Files:**
- Create: `src/renderer/components/NotesMode.tsx`

- [ ] **Step 1: Create the container**

Write `src/renderer/components/NotesMode.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck + biome**

Run: `npx tsc --noEmit && npx biome check src/renderer/components/NotesMode.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/NotesMode.tsx
git commit -m "$(cat <<'EOF'
feat(notes): NotesMode container + delete confirm

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Mode rail entry + App routing

**Files:**
- Modify: `src/renderer/components/ModeRail.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add notes to the Mode union and to the ITEMS list in ModeRail**

Find the line:

```ts
type Mode = "chat" | "skills" | "extensions" | "prompts";
```

Replace with:

```ts
type Mode = "chat" | "skills" | "extensions" | "prompts" | "notes";
```

In the same file find the `ITEMS` array and append a new entry after the prompts entry:

```ts
{
    mode: "notes",
    icon: "📝",
    label: "Notes",
    tooltip: "Notes — quick capture, stored in ~/.macpi/NOTES.md",
},
```

- [ ] **Step 2: Route the mode in App.tsx**

In `src/renderer/App.tsx` add an import:

```ts
import { NotesMode } from "./components/NotesMode";
```

Find the block where modes are routed (look for `{mode === "skills" && <SkillsMode />}`). Add a new line:

```tsx
{mode === "notes" && <NotesMode />}
```

- [ ] **Step 3: Typecheck + biome**

Run: `npx tsc --noEmit && npx biome check src/renderer/components/ModeRail.tsx src/renderer/App.tsx`
Expected: clean.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ModeRail.tsx src/renderer/App.tsx
git commit -m "$(cat <<'EOF'
feat(notes): mode rail entry + App routing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Manual smoke test (USER-DRIVEN)

This task is **user-driven** — it requires running macpi and interacting with the Notes mode. The implementer reports back from each step.

- [ ] **Step 1: Build + run**

Run: `make run`
Expected: macpi launches.

- [ ] **Step 2: Open notes mode**

Click 📝 in the mode rail.
Expected: List pane shows "No notes yet." Editor pane shows "Select a note or create a new one."

- [ ] **Step 3: Create a note**

Click "+ New". Type:

```
my first note
this is the body
with a second body line
```

Wait ~1 second after typing stops. Expected: the title appears in the list pane as "my first note" with body preview.

- [ ] **Step 4: Verify file on disk**

Run: `cat ~/.macpi/NOTES.md`
Expected:

```
## my first note
this is the body
with a second body line

```

- [ ] **Step 5: Edit the note**

Change body to "edited body". Wait ~1 second. Expected: file updates.

- [ ] **Step 6: Create a second note, verify reorder**

Click "+ New". Type "second note\nbody". Wait. Expected: list pane shows the new note at top, the first note below it.

Edit the first note again. Expected: it moves back to the top.

- [ ] **Step 7: Test external edit detection**

While macpi is running, open `~/.macpi/NOTES.md` in another editor and add a new note manually. Save.

Switch back to macpi. Type into the currently selected note. Wait ~1 second.

Expected: stale banner appears: "NOTES.md changed on disk. [Reload] or [Overwrite]?"

- [ ] **Step 8: Test Reload**

Click "Reload". Expected: banner disappears, list pane re-reads from disk (the manually-added note now appears in the list), editor resets to the on-disk version of the selected note.

- [ ] **Step 9: Test delete + confirm**

Hover a note in the list, click 🗑. Expected: confirm dialog. Click "Delete". Expected: note disappears from the list and from NOTES.md.

- [ ] **Step 10: Test app-restart persistence**

Quit macpi (Cmd-Q). Run `make run` again. Open notes mode. Expected: all notes are still there in the same order.

- [ ] **Step 11: Confirm or report regressions**

If any of the above is wrong, capture the issue (screenshot or text) and report. Common failure modes:
- Autosave not firing (check that the debounce useEffect fires after edit)
- File not created on first run (check `ensureFileExists`)
- Stale detection too aggressive / too lax (check mtime comparison)
- List pane reorder doesn't reflect most-recent-edit (check `NotesService.save`'s reorder logic)

---

## Self-review (run after writing the plan, fix inline)

**Spec coverage check:** every section of `docs/superpowers/specs/2026-05-13-macpi-notes-design.md` mapped:

- §1 Summary → Tasks 1–9 collectively
- §2 Goals → covered by the implementation
- §3 Non-goals → no tasks intentionally
- §4 Architecture overview → Tasks 1–9
- §5 Storage format / parse rules → Task 2 (parser tests + impl)
- §6 Note identity → Task 3 (UUIDs in NotesService)
- §7 External edit handling → Task 3 (stale check), Task 7 (banner UI)
- §8 Save model → Task 7 (debounced autosave)
- §9 IPC surface → Task 4
- §10 Data flow → Tasks 4, 5, 6, 7, 8
- §11 Components & file structure → Tasks 1–9
- §12 Error handling → Task 3 (first-run create), Task 7 (load-error / save-error display through `detail.isError`)
- §13 Testing strategy → Task 2 (unit), Task 3 (integration)
- §14 UI details → Tasks 6, 7, 9
- §15 Decisions → reflected throughout

**Placeholder scan:** no "TBD", no "TODO", no "implement later", no vague error-handling instructions, no missing test code, no "similar to above". Code is shown in every code-changing step.

**Type consistency:** `NoteSummary`, `NoteDetail`, `ParsedNote`, `ParseResult` are defined in Task 1 and used consistently in Tasks 2, 3, 4. `SaveResult` shape (`{ok:true,mtime}` vs `{ok:false,error:"stale",currentMtime}`) is defined in Task 3 and used in Tasks 4 (IPC types) and 7 (renderer banner). Method names (`list`, `read`, `save`, `create`, `delete`) match between service (Task 3), IPC types (Task 4), router (Task 4), query hooks (Task 5), and components (Tasks 6–8).
