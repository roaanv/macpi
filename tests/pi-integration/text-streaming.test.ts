// Layer-3 integration test: drives the real PiSessionManager via the harness
// + faux pi provider and asserts that a plain-text assistant response surfaces
// as renderer-shaped events (turn_start -> text_delta+ -> turn_end), and that
// a thinking-only response emits no text deltas.

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

describe("layer-3: text streaming", () => {
	it("forwards turn_start, text_delta+, turn_end for a plain text response", async () => {
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();
		harness.queueResponse(fauxAssistantMessage(fauxText("hello world")));

		const { events } = await drive(harness, "say hi");

		const types = events.map((e) => e.type);
		expect(types[0]).toBe("session.turn_start");
		expect(types[types.length - 1]).toBe("session.turn_end");
		expect(types).toContain("session.text_delta");

		const reassembled = events
			.filter(
				(e): e is Extract<PiEvent, { type: "session.text_delta" }> =>
					e.type === "session.text_delta",
			)
			.map((e) => e.delta)
			.join("");
		expect(reassembled).toBe("hello world");
	});

	it("does not emit text events for a thinking-only response", async () => {
		const { fauxAssistantMessage, fauxThinking } = await fauxHelpers();
		harness.queueResponse(
			fauxAssistantMessage(fauxThinking("internal monologue")),
		);

		const { events } = await drive(harness, "think out loud");

		const textEvents = events.filter((e) => e.type === "session.text_delta");
		expect(textEvents.length).toBe(0);
	});
});
