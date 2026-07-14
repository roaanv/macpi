// Reducer-only tests for the errorBanner field on TimelineSnapshot.
// We don't exercise the React hook here — that's covered by integration
// tests. We just verify the pure state transitions for session.error and
// the clear-on-turn-start behavior.

import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ErrorBanner } from "../../src/renderer/components/banners/ErrorBanner";
import { __reduceForTesting } from "../../src/renderer/state/timeline-state";
import type { PiEvent } from "../../src/shared/pi-events";

const PI = "sess-1";

function emptyish() {
	// Use __reduceForTesting with a no-op first; we don't have direct access
	// to EMPTY, but a sequence of events starting from any prior state works.
	// Easier: start fresh by reducing a turn_start onto a synthetic initial.
	return __reduceForTesting.empty;
}

describe("timeline-state error banner reducer", () => {
	it("session.error sets errorBanner and clears streaming", () => {
		const start: PiEvent = { type: "session.turn_start", piSessionId: PI };
		const fail: PiEvent = {
			type: "session.error",
			piSessionId: PI,
			code: "auth",
			message: "bad token",
		};
		const s1 = __reduceForTesting.reduce(emptyish(), start);
		expect(s1.streaming).toBe(true);
		expect(s1.errorBanner).toBe(null);
		const s2 = __reduceForTesting.reduce(s1, fail);
		expect(s2.streaming).toBe(false);
		expect(s2.errorBanner).toEqual({ code: "auth", message: "bad token" });
	});

	it("session.turn_start clears a prior errorBanner", () => {
		const fail: PiEvent = {
			type: "session.error",
			piSessionId: PI,
			code: "model",
			message: "no such model",
		};
		const start: PiEvent = { type: "session.turn_start", piSessionId: PI };
		const s1 = __reduceForTesting.reduce(emptyish(), fail);
		expect(s1.errorBanner).not.toBeNull();
		const s2 = __reduceForTesting.reduce(s1, start);
		expect(s2.errorBanner).toBe(null);
		expect(s2.streaming).toBe(true);
	});

	it("session.error preserves the rest of the snapshot", () => {
		const s0 = emptyish();
		const s1 = __reduceForTesting.reduce(s0, {
			type: "session.queue_update",
			piSessionId: PI,
			steering: ["s1"],
			followUp: ["f1", "f2"],
		});
		const s2 = __reduceForTesting.reduce(s1, {
			type: "session.error",
			piSessionId: PI,
			code: "unknown",
			message: "boom",
		});
		expect(s2.queue).toEqual({ steering: ["s1"], followUp: ["f1", "f2"] });
		expect(s2.errorBanner).toEqual({ code: "unknown", message: "boom" });
	});

	it("renders errors with urgent feedback and semantic typography", () => {
		const html = renderToStaticMarkup(
			React.createElement(ErrorBanner, {
				state: { code: "auth", message: "bad token" },
				onOpenSettings: vi.fn(),
			}),
		);

		expect(html).toContain('role="alert"');
		expect(html).toContain('aria-live="assertive"');
		expect(html).toContain("type-status");
		expect(html).toContain("type-overline");
		expect(html).toContain("type-technical-wrap");
		expect(html.match(/type-control/g)).toHaveLength(2);
	});

	it("marks ChatPane feedback and technical session values semantically", () => {
		const source = readFileSync("src/renderer/components/ChatPane.tsx", "utf8");

		expect(
			source.match(
				/className="flex flex-1 items-center justify-center type-status text-muted"/g,
			),
		).toHaveLength(2);
		expect(source).toMatch(/role="status"[^>]*className="[^"]*type-status/);
		expect(source).toMatch(/role="alert"[^>]*className="[^"]*type-status/);
		expect(source).toContain("type-code type-technical-wrap");
		expect(source).toMatch(/type-status type-technical-wrap text-err/);
	});
});
