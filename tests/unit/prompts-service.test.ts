import { describe, expect, it } from "vitest";
import { serializePromptFile } from "../../src/main/prompts-service";

describe("serializePromptFile", () => {
	it("omits frontmatter when both description and arg hint are empty", () => {
		const out = serializePromptFile("", undefined, "hello world");
		expect(out).toBe("hello world\n");
	});

	it("writes description-only frontmatter", () => {
		const out = serializePromptFile(
			"Summarize recent context",
			undefined,
			"$1",
		);
		expect(out).toBe(
			`---\ndescription: "Summarize recent context"\n---\n\n$1\n`,
		);
	});

	it("writes both description and arg hint", () => {
		const out = serializePromptFile("Recap", "<topic>", "Recap on $1.");
		expect(out).toBe(
			`---\ndescription: "Recap"\nargument-hint: "<topic>"\n---\n\nRecap on $1.\n`,
		);
	});

	it("JSON-quotes values containing colons or quotes", () => {
		const out = serializePromptFile('Says: "hi"', "<n: pages>", "body");
		expect(out).toContain('description: "Says: \\"hi\\""');
		expect(out).toContain('argument-hint: "<n: pages>"');
	});

	it("preserves an existing trailing newline in the body", () => {
		const out = serializePromptFile("d", undefined, "line\n");
		expect(out.endsWith("line\n")).toBe(true);
		expect(out.split("\n").length).toBe(6); // ---, description, ---, blank, line, ''
	});
});
