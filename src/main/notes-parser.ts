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

import type { ParsedNote, ParseResult } from "../shared/notes-types";

const NOTE_HEADING = /^## (.*)$/;

/** Parse NOTES.md text into a preamble + ordered note list. */
export function parseNotesMd(text: string): ParseResult {
	const normalised = text.replace(/\r\n/g, "\n");
	const lines = normalised.split("\n");
	const notes: ParsedNote[] = [];
	const preambleLines: string[] = [];
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

	// Reconstruct preamble. The tricky part: split("\n") treats \n as a
	// separator, not a terminator. So each collected preamble line was
	// originally followed by a \n that must be restored.
	//
	// When there are notes: preamble ended just before the first ## line.
	// Every preamble line (including the last) had a \n terminator, so
	// join with \n and add a trailing \n — but only when preamble is
	// non-empty (otherwise we'd produce "\n" instead of "").
	//
	// When preamble-only: the last token from split is "" (artifact of the
	// trailing \n). Joining all tokens with \n gives the right result
	// except we need a trailing \n if the original ended with one; the
	// empty trailing token handles that correctly via the join itself —
	// but we have one extra "" at the end that adds an unwanted \n.
	// Fix: drop the trailing "" from the array before joining, then
	// add \n if original ended with one.
	let preamble: string;
	if (notes.length > 0) {
		// File has notes: restore the \n terminator on each preamble line.
		preamble = preambleLines.length > 0 ? `${preambleLines.join("\n")}\n` : "";
	} else {
		// Preamble-only: the split produced a trailing "" for the final \n.
		// Drop it, join remaining, then re-add \n if original ended with one.
		const trimmed =
			preambleLines.length > 0 && preambleLines[preambleLines.length - 1] === ""
				? preambleLines.slice(0, -1)
				: preambleLines;
		preamble = trimmed.join("\n");
		if (normalised.endsWith("\n") && preamble.length > 0) {
			preamble += "\n";
		}
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
 *   - First non-empty line is the title (after stripping ALL leading
 *     `## ` prefixes the user may have typed).
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
	const title = (lines[titleIndex] ?? "").replace(/^(## )+/, "").trimEnd();
	const body = lines.slice(titleIndex + 1).join("\n");
	return { title, body };
}

/** Convert a parsed note back to the editor's text blob. */
export function noteToBlob(note: ParsedNote): string {
	if (note.body === "") return note.title;
	return `${note.title}\n${note.body}`;
}
