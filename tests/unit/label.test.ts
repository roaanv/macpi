import { describe, expect, it } from "vitest";
import {
	computeSessionLabel,
	formatFirstMessageLabel,
} from "../../src/renderer/utils/label";

describe("computeSessionLabel", () => {
	it("returns label when set", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s-abc",
				cwd: "/home/x/macpi",
				label: "named one",
			}),
		).toBe("named one");
	});

	it("falls back to cwd basename when label is null", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s-abc12345",
				cwd: "/home/x/macpi",
				label: null,
			}),
		).toBe("macpi");
	});

	it("falls back to short-id when cwd and label are null", () => {
		expect(
			computeSessionLabel({
				piSessionId: "abc12345-rest",
				cwd: null,
				label: null,
			}),
		).toBe("abc12345");
	});

	it("strips trailing slash from cwd before extracting basename", () => {
		expect(
			computeSessionLabel({
				piSessionId: "s",
				cwd: "/home/x/macpi/",
				label: null,
			}),
		).toBe("macpi");
	});
});

describe("formatFirstMessageLabel", () => {
	it("formats as `basename: text` and ellipsizes long text", () => {
		const out = formatFirstMessageLabel(
			"macpi",
			"fix the build because it has been failing",
		);
		expect(out.startsWith("macpi: ")).toBe(true);
		expect(out.length).toBeLessThanOrEqual(48);
		expect(out.endsWith("…")).toBe(true);
	});

	it("does not ellipsize short text", () => {
		expect(formatFirstMessageLabel("macpi", "hi")).toBe("macpi: hi");
	});

	it("uses '(unlabeled)' when basename is empty", () => {
		expect(formatFirstMessageLabel("", "hi")).toBe("(unlabeled): hi");
	});

	it("collapses internal newlines/whitespace to single spaces", () => {
		expect(formatFirstMessageLabel("x", "a\n\nb\tc")).toBe("x: a b c");
	});
});
