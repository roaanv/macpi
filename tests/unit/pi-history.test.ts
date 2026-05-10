import { describe, expect, it } from "vitest";
import { agentMessagesToTimeline } from "../../src/main/pi-history";

// We mint plain object literals shaped like pi-ai's persisted Message variants.
// The translator only reads structural properties, so this avoids depending on
// SDK constructors at unit-test layer.

describe("agentMessagesToTimeline", () => {
	it("returns empty for an empty message list", () => {
		expect(agentMessagesToTimeline([])).toEqual([]);
	});

	it("translates a user message with string content", () => {
		const result = agentMessagesToTimeline([
			{ role: "user", content: "hello", timestamp: 1 },
		]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ kind: "user", text: "hello" });
	});

	it("translates a user message with content array", () => {
		const result = agentMessagesToTimeline([
			{
				role: "user",
				content: [
					{ type: "text", text: "hi " },
					{ type: "text", text: "there" },
				],
				timestamp: 1,
			},
		]);
		expect(result[0]).toMatchObject({ kind: "user", text: "hi there" });
	});

	it("translates an assistant message with text + thinking", () => {
		const result = agentMessagesToTimeline([
			{
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "let me think" },
					{ type: "text", text: "the answer is 42" },
				],
				stopReason: "stop",
				timestamp: 1,
			} as never,
		]);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			kind: "assistant-text",
			text: "the answer is 42",
			thinking: "let me think",
			streaming: false,
		});
	});

	it("translates a tool call + result pair into a single tool-call entry", () => {
		const result = agentMessagesToTimeline([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "I'll list files" },
					{
						type: "toolCall",
						id: "tc-1",
						name: "ls",
						arguments: { path: "." },
					},
				],
				stopReason: "toolUse",
				timestamp: 1,
			} as never,
			{
				role: "toolResult",
				toolCallId: "tc-1",
				toolName: "ls",
				content: [{ type: "text", text: "file1\nfile2" }],
				isError: false,
				timestamp: 2,
			} as never,
		]);

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			kind: "assistant-text",
			text: "I'll list files",
		});
		expect(result[1]).toMatchObject({
			kind: "tool-call",
			id: "tc-1",
			toolName: "ls",
			args: { path: "." },
			state: "ok",
		});
	});

	it("marks tool-call as error when result.isError is true", () => {
		const result = agentMessagesToTimeline([
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc-2",
						name: "bash",
						arguments: { command: "false" },
					},
				],
				stopReason: "toolUse",
				timestamp: 1,
			} as never,
			{
				role: "toolResult",
				toolCallId: "tc-2",
				toolName: "bash",
				content: [{ type: "text", text: "exit 1" }],
				isError: true,
				timestamp: 2,
			} as never,
		]);

		const toolEntry = result.find((e) => e.kind === "tool-call");
		expect(toolEntry).toMatchObject({ state: "error" });
	});

	it("leaves an unmatched tool-call as pending", () => {
		const result = agentMessagesToTimeline([
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "tc-orphan", name: "ls", arguments: {} },
				],
				stopReason: "toolUse",
				timestamp: 1,
			} as never,
		]);
		const toolEntry = result.find((e) => e.kind === "tool-call");
		expect(toolEntry).toMatchObject({ state: "pending", result: null });
	});

	it("skips unknown message types without crashing", () => {
		const result = agentMessagesToTimeline([
			{ role: "user", content: "hi", timestamp: 1 },
			// A custom-message-like shape pi might persist; translator should ignore it
			{
				customType: "branchSummary",
				content: "ignored",
				timestamp: 2,
			} as never,
			{
				role: "assistant",
				content: [{ type: "text", text: "hello" }],
				stopReason: "stop",
				timestamp: 3,
			} as never,
		]);
		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({ kind: "user" });
		expect(result[1]).toMatchObject({ kind: "assistant-text" });
	});
});
