// Unit tests for the toast registry's module-level state. Exercises the
// pub/sub + timer behaviour without rendering React — ToastHost is a
// thin presenter over this hook.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	dismissToast,
	showToast,
	subscribeForTests,
} from "../../src/renderer/hooks/use-toast";

interface PublishedState {
	message: string | null;
	id: number;
}

describe("toast registry", () => {
	beforeEach(() => {
		dismissToast();
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("publishes the message to subscribers when showToast is called", () => {
		const received: PublishedState[] = [];
		const unsub = subscribeForTests((s) => received.push(s));
		showToast("hello");
		unsub();
		expect(received.at(-1)?.message).toBe("hello");
	});

	it("clears the message after 3 seconds", () => {
		const received: PublishedState[] = [];
		const unsub = subscribeForTests((s) => received.push(s));
		showToast("hello");
		expect(received.at(-1)?.message).toBe("hello");
		vi.advanceTimersByTime(3000);
		expect(received.at(-1)?.message).toBeNull();
		unsub();
	});

	it("replaces a previous toast (doesn't queue)", () => {
		const received: PublishedState[] = [];
		const unsub = subscribeForTests((s) => received.push(s));
		showToast("first");
		showToast("second");
		expect(received.at(-1)?.message).toBe("second");
		unsub();
	});

	it("dismissToast clears the in-flight toast immediately", () => {
		const received: PublishedState[] = [];
		const unsub = subscribeForTests((s) => received.push(s));
		showToast("hello");
		dismissToast();
		expect(received.at(-1)?.message).toBeNull();
		unsub();
	});
});
