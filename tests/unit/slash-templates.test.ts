import { describe, expect, it, vi } from "vitest";
import {
	dispatchTemplate,
	templateCommands,
} from "../../src/renderer/slash/templates";
import type { PromptSummary } from "../../src/shared/prompts-types";

const prompt: PromptSummary = {
	id: "review",
	name: "review",
	description: "Review a PR",
	argumentHint: "<PR-URL>",
	source: "/u/p/prompts/review.md",
	relativePath: "review.md",
	enabled: true,
};

describe("templateCommands", () => {
	it("maps a PromptSummary to a SlashCommand with kind=template", () => {
		const [cmd] = templateCommands([prompt]);
		expect(cmd).toMatchObject({
			name: "review",
			description: "Review a PR",
			argumentHint: "<PR-URL>",
			kind: "template",
			availableDuringStream: true,
		});
	});

	it("returns an empty array for an empty input", () => {
		expect(templateCommands([])).toEqual([]);
	});
});

describe("dispatchTemplate", () => {
	it("returns {kind:'replace'} with expanded body on success", async () => {
		const invoke = vi.fn().mockResolvedValue({
			manifest: {
				name: "review",
				description: "Review",
				source: "",
				relativePath: "review.md",
			},
			body: "Review $1 thoroughly.",
		});
		const action = await dispatchTemplate(
			prompt,
			["https://example.com/pr/1"],
			invoke as unknown as <M>(m: M, a: unknown) => Promise<unknown>,
		);
		expect(invoke).toHaveBeenCalledWith("prompts.read", { id: "review" });
		expect(action).toEqual({
			kind: "replace",
			text: "Review https://example.com/pr/1 thoroughly.",
		});
	});

	it("returns {kind:'error'} when the IPC throws", async () => {
		const invoke = vi.fn().mockRejectedValue(new Error("boom"));
		const action = await dispatchTemplate(
			prompt,
			[],
			invoke as unknown as <M>(m: M, a: unknown) => Promise<unknown>,
		);
		expect(action).toEqual({
			kind: "error",
			message: "Template not available: boom",
		});
	});
});
