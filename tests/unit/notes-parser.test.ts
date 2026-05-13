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
