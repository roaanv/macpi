// Layer-3 integration test: drives the real PiSessionManager via the harness
// + faux pi provider and asserts that an assistant response containing both
// thinking and text content surfaces matching session.thinking_delta and
// session.text_delta events with the correct payloads.

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

describe("layer-3: thinking deltas", () => {
	it("forwards session.thinking_delta for thinking content", async () => {
		const { fauxAssistantMessage, fauxText, fauxThinking } =
			await fauxHelpers();
		harness.queueResponse(
			fauxAssistantMessage([
				fauxThinking("hmm let me think"),
				fauxText("the answer is 42"),
			]),
		);

		const { events } = await drive(harness, "what is the meaning of life?");

		const thinkingBuf = events
			.filter(
				(e): e is Extract<PiEvent, { type: "session.thinking_delta" }> =>
					e.type === "session.thinking_delta",
			)
			.map((e) => e.delta)
			.join("");
		const textBuf = events
			.filter(
				(e): e is Extract<PiEvent, { type: "session.text_delta" }> =>
					e.type === "session.text_delta",
			)
			.map((e) => e.delta)
			.join("");

		expect(thinkingBuf).toBe("hmm let me think");
		expect(textBuf).toBe("the answer is 42");
	});
});
