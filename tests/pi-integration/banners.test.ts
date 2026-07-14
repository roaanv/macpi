// Layer-3 integration test: drives the harness with retry enabled and
// simulates a retryable provider failure to confirm `session.retry_start`
// fires. The default harness disables retry/compaction for determinism, so
// this file rebuilds the settingsManager override with retry enabled.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { CompactionBanner } from "../../src/renderer/components/banners/CompactionBanner";
import { QueuePills } from "../../src/renderer/components/banners/QueuePills";
import { RetryBanner } from "../../src/renderer/components/banners/RetryBanner";
import {
	createHarness,
	drive,
	fauxHelpers,
	type Harness,
} from "./test-harness";

describe("layer-3: banners", () => {
	let harness: Harness | null = null;

	afterEach(() => {
		harness?.dispose();
		harness = null;
	});

	it("gives banner feedback semantic typography and live-region urgency", () => {
		const retry = renderToStaticMarkup(
			React.createElement(RetryBanner, {
				retry: {
					attempt: 1,
					maxAttempts: 3,
					errorMessage: "rate limit exceeded",
				},
			}),
		);
		const compacting = renderToStaticMarkup(
			React.createElement(CompactionBanner, {
				compaction: { reason: "threshold" },
				lastResult: null,
			}),
		);
		const compactionError = renderToStaticMarkup(
			React.createElement(CompactionBanner, {
				compaction: null,
				lastResult: { ok: false, message: "generated failure" },
			}),
		);
		const queue = renderToStaticMarkup(
			React.createElement(QueuePills, {
				queue: { steering: ["redirect"], followUp: ["continue"] },
				onClear: () => undefined,
				onRemove: () => undefined,
			}),
		);

		expect(retry).toContain('role="status"');
		expect(retry).toContain("type-status");
		expect(retry).toContain("type-overline");
		expect(retry).toContain("type-technical-wrap");
		expect(retry).toContain("rate limit exceeded");

		expect(compacting).toContain('role="status"');
		expect(compacting).toContain("type-status");
		expect(compacting).toContain("type-overline");
		expect(compacting).toContain("threshold");
		expect(compactionError).toContain('role="alert"');
		expect(compactionError).toContain("type-status");
		expect(compactionError).toContain("type-overline");
		expect(compactionError).toContain("type-technical-wrap");
		expect(compactionError).toContain("generated failure");

		expect(queue).toContain('role="status"');
		expect(queue).toContain("type-status");
		expect(queue.match(/type-control/g)).toHaveLength(3);
		expect(queue).toContain("steered: redirect");
		expect(queue).toContain("queued: continue");
		expect(queue).toContain("Clear");
		expect(queue).not.toMatch(/text-\[(?:10|11)px\]/);
	});

	it("emits retry_start when the provider returns a retryable error and retry is enabled", async () => {
		harness = await createHarness();

		// pi-coding-agent isn't re-exported by fauxHelpers (intentionally —
		// the harness public API is kept narrow). Dynamic import is required
		// because the package is ESM-only.
		const piCoding = await import("@earendil-works/pi-coding-agent");
		const overrides = (
			harness.manager as unknown as {
				__testOverrides: { settingsManager: unknown };
			}
		).__testOverrides;
		// Lower baseDelayMs to keep the retry sleep snappy; the default is
		// 2000ms which would push us close to the drive() timeout when the
		// retry attempt then races with our queue-later timer.
		overrides.settingsManager = piCoding.SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: true, maxRetries: 2, baseDelayMs: 50 },
		});

		const { fauxAssistantMessage, fauxText } = await fauxHelpers();

		// Why a response factory and not the queue-later strategy:
		// pi's `_isRetryableError` (agent-session.js) checks the error message
		// against a regex of transient-failure phrases ("rate limit",
		// "overloaded", "503", etc.). The faux provider's "No more faux
		// responses queued" message does NOT match, so pre-queuing zero
		// responses produces a non-retryable error and pi falls through
		// without firing `auto_retry_start`.
		//
		// The factory below throws an Error whose message DOES match the
		// regex; the faux provider catches it and emits a `stopReason:"error"`
		// assistant message with that string as `errorMessage`, which pi
		// then classifies as retryable and retries on. The second queued
		// response is a normal success that satisfies the retry attempt.
		harness.queueResponse(() => {
			throw new Error("rate limit exceeded");
		});
		harness.queueResponse(fauxAssistantMessage(fauxText("recovered")));

		const { events } = await drive(harness, "trigger retry", {
			timeoutMs: 8_000,
		});

		const retryStart = events.find((e) => e.type === "session.retry_start");
		expect(
			retryStart,
			`expected at least one retry_start. saw types: ${events
				.map((e) => e.type)
				.join(",")}`,
		).toBeTruthy();
	});
});
