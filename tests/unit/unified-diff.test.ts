import { describe, expect, it } from "vitest";
import { unifiedDiffLines } from "../../src/renderer/utils/unified-diff";

describe("unifiedDiffLines", () => {
	it("returns equal lines for identical input", () => {
		const r = unifiedDiffLines("a\nb\nc", "a\nb\nc");
		expect(r.every((l) => l.kind === "equal")).toBe(true);
		expect(r.length).toBe(3);
	});

	it("emits remove + add for a single-line replacement", () => {
		const r = unifiedDiffLines("foo\nbar", "foo\nbaz");
		expect(r.map((l) => l.kind)).toEqual(["equal", "remove", "add"]);
		expect(r[1].text).toBe("bar");
		expect(r[2].text).toBe("baz");
	});

	it("treats new-file as all additions when oldText is empty", () => {
		const r = unifiedDiffLines("", "x\ny\nz");
		expect(r.map((l) => l.kind)).toEqual(["add", "add", "add"]);
	});

	it("treats deletion as all removals when newText is empty", () => {
		const r = unifiedDiffLines("x\ny", "");
		expect(r.map((l) => l.kind)).toEqual(["remove", "remove"]);
	});
});
