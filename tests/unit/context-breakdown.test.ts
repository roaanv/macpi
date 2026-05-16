// Unit tests for the context-breakdown segmentation that powers the
// nano-context-style bar under the chat composer.

import { describe, expect, it } from "vitest";
import {
	buildContextBreakdown,
	formatTokens,
	IMAGE_TOKEN_ESTIMATE,
	scaleSegmentsToTarget,
	segmentMessages,
	segmentTotal,
	sumAssistantUsage,
} from "../../src/shared/context-breakdown";

describe("segmentMessages", () => {
	it("attributes system prompt length to the system bucket", () => {
		const out = segmentMessages([], "x".repeat(40));
		expect(out.system).toBe(10);
		expect(out.prompt).toBe(0);
		expect(out.assistant).toBe(0);
	});

	it("counts user text as prompt, including image content as 1200 each", () => {
		const out = segmentMessages(
			[
				{
					role: "user",
					content: [
						{ type: "text", text: "x".repeat(40) },
						{ type: "image" },
						{ type: "image" },
					],
				},
			],
			"",
		);
		expect(out.prompt).toBe(10 + 2 * IMAGE_TOKEN_ESTIMATE);
	});

	it("splits assistant text + thinking + toolCall into their own buckets", () => {
		const out = segmentMessages(
			[
				{
					role: "assistant",
					content: [
						{ type: "text", text: "x".repeat(40) },
						{ type: "thinking", thinking: "y".repeat(20) },
						{
							type: "toolCall",
							name: "read",
							arguments: { path: "/tmp/x.txt" },
						},
					],
				},
			],
			"",
		);
		expect(out.assistant).toBeGreaterThanOrEqual(10); // text + toolCall
		expect(out.thinking).toBe(5);
		expect(out.tools).toBe(0);
	});

	it("attributes tool results to the tools bucket", () => {
		const out = segmentMessages(
			[
				{
					role: "toolResult",
					content: [{ type: "text", text: "x".repeat(80) }],
				},
			],
			"",
		);
		expect(out.tools).toBe(20);
	});

	it("ignores records without a known role", () => {
		const out = segmentMessages(
			[{ role: "system", content: "ignored" }, null, "string", {}],
			"",
		);
		expect(segmentTotal(out)).toBe(0);
	});
});

describe("scaleSegmentsToTarget", () => {
	it("returns empty segments when target is zero (nothing to allocate)", () => {
		const seg = { system: 5, prompt: 0, assistant: 0, thinking: 0, tools: 0 };
		expect(scaleSegmentsToTarget(seg, 0)).toEqual({
			system: 0,
			prompt: 0,
			assistant: 0,
			thinking: 0,
			tools: 0,
		});
	});

	it("returns the input unchanged when total is zero (nothing to scale from)", () => {
		const empty = { system: 0, prompt: 0, assistant: 0, thinking: 0, tools: 0 };
		expect(scaleSegmentsToTarget(empty, 10)).toEqual(empty);
	});

	it("preserves the sum equal to target via the largest-remainder method", () => {
		const seg = {
			system: 30,
			prompt: 10,
			assistant: 7,
			thinking: 0,
			tools: 3,
		};
		const scaled = scaleSegmentsToTarget(seg, 100);
		expect(segmentTotal(scaled)).toBe(100);
		// proportions roughly preserved
		expect(scaled.system).toBeGreaterThan(scaled.prompt);
		expect(scaled.prompt).toBeGreaterThan(scaled.assistant);
	});
});

describe("buildContextBreakdown", () => {
	it("uses measuredTokens when present and flags estimated=false", () => {
		const out = buildContextBreakdown({
			messages: [{ role: "user", content: [{ type: "text", text: "abcd" }] }],
			systemPrompt: "",
			measuredTokens: 50,
			contextWindow: 200,
		});
		expect(out.usedTokens).toBe(50);
		expect(out.usageIsEstimated).toBe(false);
		expect(segmentTotal(out.segments)).toBe(50);
		expect(out.freeTokens).toBe(150);
	});

	it("falls back to the estimate and flags estimated=true when no measurement", () => {
		const out = buildContextBreakdown({
			messages: [
				{ role: "user", content: [{ type: "text", text: "x".repeat(80) }] },
			],
			systemPrompt: "",
			measuredTokens: null,
			contextWindow: 200,
		});
		expect(out.usedTokens).toBe(20);
		expect(out.usageIsEstimated).toBe(true);
		expect(out.freeTokens).toBe(180);
	});
});

describe("sumAssistantUsage", () => {
	it("sums numeric usage fields across assistant messages, ignoring others", () => {
		const totals = sumAssistantUsage([
			{
				role: "assistant",
				usage: {
					input: 100,
					output: 50,
					cacheRead: 10,
					cacheWrite: 5,
					cost: { total: 0.001 },
				},
			},
			{ role: "user", usage: { input: 99 } }, // ignored
			{
				role: "assistant",
				usage: {
					input: 200,
					output: 80,
					cacheRead: 0,
					cacheWrite: 0,
					cost: { total: 0.002 },
				},
			},
			{ role: "assistant" }, // no usage — skipped
		]);
		expect(totals).toEqual({
			input: 300,
			output: 130,
			cacheRead: 10,
			cacheWrite: 5,
			cost: 0.003,
		});
	});
});

describe("formatTokens", () => {
	it("formats counts using the same scale as nano-context", () => {
		expect(formatTokens(0)).toBe("0");
		expect(formatTokens(999)).toBe("999");
		expect(formatTokens(1500)).toBe("1.5k");
		expect(formatTokens(10_500)).toBe("11k");
		expect(formatTokens(1_500_000)).toBe("1.5M");
	});
});
