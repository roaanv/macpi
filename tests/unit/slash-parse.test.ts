import { describe, expect, it } from "vitest";
import { parse } from "../../src/renderer/slash/parse";

describe("parse", () => {
	it("returns null for input that doesn't start with /", () => {
		expect(parse("foo")).toBeNull();
		expect(parse(" /foo")).toBeNull();
		expect(parse("")).toBeNull();
	});

	it("returns empty name for bare slash", () => {
		expect(parse("/")).toEqual({ name: "", args: [] });
	});

	it("parses a name with no args", () => {
		expect(parse("/foo")).toEqual({ name: "foo", args: [] });
	});

	it("parses space-separated args", () => {
		expect(parse("/foo bar baz")).toEqual({
			name: "foo",
			args: ["bar", "baz"],
		});
	});

	it("preserves double-quoted spans as a single arg", () => {
		expect(parse('/foo "a b" c')).toEqual({ name: "foo", args: ["a b", "c"] });
	});

	it("allows a colon in the name (for /skill:name)", () => {
		expect(parse("/skill:fmt")).toEqual({ name: "skill:fmt", args: [] });
		expect(parse("/skill:fmt arg1")).toEqual({
			name: "skill:fmt",
			args: ["arg1"],
		});
	});

	it("returns null when a newline appears before the first space", () => {
		expect(parse("/foo\nbar")).toBeNull();
	});

	it("collapses runs of whitespace inside unquoted regions", () => {
		expect(parse("/foo   bar    baz")).toEqual({
			name: "foo",
			args: ["bar", "baz"],
		});
	});

	// Pinning tests for edge cases that aren't in the spec but the
	// implementation handles. Document current behaviour so a future
	// "simplification" doesn't silently change it.

	it("preserves an empty quoted span as an empty-string arg", () => {
		expect(parse('/foo ""')).toEqual({ name: "foo", args: [""] });
	});

	it("forgivingly accepts an unterminated quote (consumes to end)", () => {
		expect(parse('/foo "ab')).toEqual({ name: "foo", args: ["ab"] });
	});
});
