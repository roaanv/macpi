import { describe, expect, it } from "vitest";
import { truncateOutput } from "../../src/renderer/utils/truncate-output";

describe("truncateOutput", () => {
	it("returns the input unchanged when under 200 lines", () => {
		const input = Array.from({ length: 150 }, (_, i) => `line${i}`).join("\n");
		const r = truncateOutput(input);
		expect(r.truncated).toBe(false);
		expect(r.text).toBe(input);
		expect(r.totalLines).toBe(150);
	});

	it("keeps the first 100 and last 100 lines when over 200", () => {
		const lines = Array.from({ length: 500 }, (_, i) => `line${i}`);
		const input = lines.join("\n");
		const r = truncateOutput(input);
		expect(r.truncated).toBe(true);
		expect(r.totalLines).toBe(500);
		expect(r.text).toContain("line0");
		expect(r.text).toContain("line99");
		expect(r.text).toContain("line400");
		expect(r.text).toContain("line499");
		expect(r.text).not.toContain("line150");
		expect(r.text).toMatch(/300 lines truncated/);
	});

	it("treats CRLF and LF the same", () => {
		const input = "a\r\nb\r\nc";
		const r = truncateOutput(input);
		expect(r.totalLines).toBe(3);
	});
});
