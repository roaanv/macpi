// Layer-3 integration test: drives the real PiSessionManager via the harness
// + faux pi provider and asserts that an assistant response containing a tool
// call surfaces as matching session.tool_start / session.tool_end events with
// the same toolCallId.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PiEvent } from "../../src/shared/pi-events";
import {
	createHarness,
	drive,
	fauxHelpers,
	type Harness,
} from "./test-harness";

let harness: Harness;

beforeEach(async () => {
	harness = await createHarness();
});

afterEach(() => {
	harness.dispose();
});

describe("layer-3: tool events", () => {
	it("emits session.tool_start and session.tool_end for a tool call", async () => {
		const { fauxAssistantMessage, fauxText, fauxToolCall } =
			await fauxHelpers();
		harness.queueResponse(
			fauxAssistantMessage([
				fauxText("checking files"),
				fauxToolCall("ls", { path: "." }, { id: "tool-1" }),
			]),
		);
		// The faux provider needs a follow-up response after the tool result
		// arrives. Queue a final text-only message so the turn can complete.
		harness.queueResponse(fauxAssistantMessage(fauxText("done")));

		const { events } = await drive(harness, "list files");

		const start = events.find(
			(e): e is Extract<PiEvent, { type: "session.tool_start" }> =>
				e.type === "session.tool_start" && e.toolCallId === "tool-1",
		);
		const end = events.find(
			(e): e is Extract<PiEvent, { type: "session.tool_end" }> =>
				e.type === "session.tool_end" && e.toolCallId === "tool-1",
		);
		expect(start).toBeTruthy();
		expect(end).toBeTruthy();
		expect(start?.toolName).toBe("ls");
	});
});
