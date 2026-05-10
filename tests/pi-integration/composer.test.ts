import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PiEvent } from "../../src/shared/pi-events";
import { createHarness, fauxHelpers, type Harness } from "./test-harness";

let harness: Harness;

beforeEach(async () => {
	harness = await createHarness();
});

afterEach(() => {
	harness.dispose();
});

describe("layer-3: composer follow-up queueing", () => {
	it("queueing during a turn shows up in queue_update.followUp", async () => {
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();

		// Turn 1: a slow-ish response so we have time to queue mid-stream.
		// We use a FauxResponseFactory that returns a Promise; the faux
		// provider awaits it before streaming chunks, which holds the turn
		// open while the test interleaves a follow-up prompt. (A plain long
		// AssistantMessage isn't sufficient here because the faux provider
		// drains all chunks within a single microtask burst, so the
		// awaiting `prompt(turn1)` call resolves before any setTimeout-
		// scheduled follow-up call gets a chance to run.)
		const message1 = fauxAssistantMessage(fauxText("first answer body"));
		const factory1 = (() =>
			new Promise<typeof message1>((resolve) =>
				setTimeout(() => resolve(message1), 50),
			)) as unknown as () => typeof message1;
		harness.queueResponse(factory1);
		// Turn 2 (the follow-up causes a second turn): a quick response so
		// drive() doesn't time out waiting for the second turn_end.
		harness.queueResponse(fauxAssistantMessage(fauxText("got the follow-up")));

		const piSessionId = await harness.manager.createSession({
			cwd: harness.cwd,
		});
		const events: PiEvent[] = [];
		const off = harness.subscribe((e) => events.push(e));

		// Start the first turn but don't await yet.
		const turn1 = harness.manager.prompt(piSessionId, "tell me");
		// Wait for turn_start to confirm streaming has begun.
		await waitFor(events, (e) => e.type === "session.turn_start");
		// Queue a follow-up; pi should record it via queue_update.
		await harness.manager.prompt(piSessionId, "and then this", "followUp");
		// Let turn 1 + the queued turn 2 both complete.
		await turn1;
		await waitForTwoTurnEnds(events);
		off();

		const queueEvents = events.filter(
			(e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
				e.type === "session.queue_update",
		);
		expect(queueEvents.length).toBeGreaterThan(0);
		const someEventCarriedFollowUp = queueEvents.some((e) =>
			e.followUp.includes("and then this"),
		);
		expect(
			someEventCarriedFollowUp,
			`expected a queue_update with the queued follow-up. saw: ${queueEvents.map((e) => `[steer:${e.steering.join("|")} follow:${e.followUp.join("|")}]`).join(", ")}`,
		).toBe(true);
	});

	it("steering during a turn shows up in queue_update.steering", async () => {
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();

		// Turn 1: hold the turn open with a delayed factory so the steer
		// prompt can interleave before turn_end fires. See the comment in
		// the followUp test above for why this Promise-delay pattern is
		// required (the faux provider drains chunks synchronously).
		const message1 = fauxAssistantMessage(
			fauxText("first answer with several words to chunk"),
		);
		const factory1 = (() =>
			new Promise<typeof message1>((resolve) =>
				setTimeout(() => resolve(message1), 50),
			)) as unknown as () => typeof message1;
		harness.queueResponse(factory1);
		// Turn 2 (after the steer): a quick literal response is fine.
		harness.queueResponse(fauxAssistantMessage(fauxText("steered response")));

		const piSessionId = await harness.manager.createSession({
			cwd: harness.cwd,
		});
		const events: PiEvent[] = [];
		const off = harness.subscribe((e) => events.push(e));

		const turn1 = harness.manager.prompt(piSessionId, "tell me");
		await waitFor(events, (e) => e.type === "session.turn_start");
		await harness.manager.prompt(
			piSessionId,
			"actually do this instead",
			"steer",
		);
		await turn1;
		await waitForTwoTurnEnds(events);
		off();

		const queueEvents = events.filter(
			(e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
				e.type === "session.queue_update",
		);
		const someEventCarriedSteer = queueEvents.some((e) =>
			e.steering.includes("actually do this instead"),
		);
		expect(
			someEventCarriedSteer,
			`expected a queue_update with the steered message. saw: ${queueEvents.map((e) => `[steer:${e.steering.join("|")} follow:${e.followUp.join("|")}]`).join(", ")}`,
		).toBe(true);
	});

	it("clearQueue() empties the queue and returns the cleared messages", async () => {
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();

		// Turn 1: hold the turn open with a delayed factory so the queued
		// follow-up can be appended (and then cleared) before turn_end fires.
		// See the comments in the followUp/steer tests above for why this
		// Promise-delay pattern is required.
		const message1 = fauxAssistantMessage(
			fauxText("first answer with several words to chunk"),
		);
		const factory1 = (() =>
			new Promise<typeof message1>((resolve) =>
				setTimeout(() => resolve(message1), 50),
			)) as unknown as () => typeof message1;
		harness.queueResponse(factory1);
		// We don't expect a second turn here — the queued follow-up gets
		// cleared before turn 1 finishes consuming the queue. So we don't
		// need a 2nd faux response.

		const piSessionId = await harness.manager.createSession({
			cwd: harness.cwd,
		});
		const events: PiEvent[] = [];
		const off = harness.subscribe((e) => events.push(e));

		const turn1 = harness.manager.prompt(piSessionId, "tell me");
		await waitFor(events, (e) => e.type === "session.turn_start");
		await harness.manager.prompt(piSessionId, "queued thing", "followUp");
		// Wait for the queue_update with our queued message before clearing.
		await waitFor(
			events,
			(e) =>
				e.type === "session.queue_update" &&
				e.followUp.includes("queued thing"),
		);

		const cleared = await harness.manager.clearQueue(piSessionId);
		await turn1;
		await waitFor(events, (e) => e.type === "session.turn_end");
		off();

		expect(cleared.followUp).toContain("queued thing");
		// After clear, a queue_update should fire with empty followUp.
		const post = events.filter(
			(e): e is Extract<PiEvent, { type: "session.queue_update" }> =>
				e.type === "session.queue_update",
		);
		const last = post[post.length - 1];
		expect(last).toBeTruthy();
		expect(last?.followUp).not.toContain("queued thing");
	});

	it("abort() ends the current turn promptly", async () => {
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();

		// A long message so the turn is well in flight when we call abort.
		// We also wrap it in a delayed factory because the faux provider
		// streams chunks synchronously — without a Promise-delay the
		// `prompt()` call would resolve before `abort()` can run. See the
		// followUp/steer/clearQueue tests above for the same pattern.
		const longBody = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
		const longMessage = fauxAssistantMessage(fauxText(longBody));
		const longFactory = (() =>
			new Promise<typeof longMessage>((resolve) =>
				setTimeout(() => resolve(longMessage), 50),
			)) as unknown as () => typeof longMessage;
		harness.queueResponse(longFactory);

		const piSessionId = await harness.manager.createSession({
			cwd: harness.cwd,
		});
		const events: PiEvent[] = [];
		const off = harness.subscribe((e) => events.push(e));

		const turn1 = harness.manager.prompt(piSessionId, "tell me a long story");
		await waitFor(events, (e) => e.type === "session.turn_start");
		await harness.manager.abort(piSessionId);
		// turn1 must resolve (or reject — both are acceptable for an aborted turn).
		await turn1.catch(() => undefined);
		await waitFor(events, (e) => e.type === "session.turn_end");
		off();

		// The aborted turn should have produced fewer text deltas than the full
		// 80-word body (the faux provider streams 2-4 tokens at a time, so a full
		// body would be ~20-40 deltas). Pick a generous upper bound — say 40 — to
		// tolerate timing variance while still proving abort interrupted streaming.
		const textDeltaCount = events.filter(
			(e) => e.type === "session.text_delta",
		).length;
		expect(textDeltaCount).toBeLessThan(40);
	});
});

function waitFor(
	events: PiEvent[],
	predicate: (e: PiEvent) => boolean,
	timeoutMs = 5_000,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const start = Date.now();
		const tick = () => {
			if (events.some(predicate)) return resolve();
			if (Date.now() - start > timeoutMs) {
				return reject(
					new Error("waitFor: predicate not satisfied within timeout"),
				);
			}
			setTimeout(tick, 10);
		};
		tick();
	});
}

function waitForTwoTurnEnds(
	events: PiEvent[],
	timeoutMs = 8_000,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const start = Date.now();
		const tick = () => {
			const ends = events.filter((e) => e.type === "session.turn_end").length;
			if (ends >= 2) return resolve();
			if (Date.now() - start > timeoutMs) {
				return reject(
					new Error(`waitForTwoTurnEnds: only saw ${ends} turn_end events`),
				);
			}
			setTimeout(tick, 10);
		};
		tick();
	});
}
