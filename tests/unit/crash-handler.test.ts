// We can't exercise installCrashHandler() directly without polluting
// process listeners. Instead, the crash-handler module exports its core
// behavior via a testable helper. Since we kept it private in the
// implementation, this test patches `process` listeners and verifies that
// when an uncaughtException fires, a crash-<ts>.log file is written
// containing the stack + the recent log lines, and that app.exit is called.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { electronExit, electronShowErrorBox } = vi.hoisted(() => ({
	electronExit: vi.fn(),
	electronShowErrorBox: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { exit: electronExit },
	dialog: { showErrorBox: electronShowErrorBox },
}));

import { installCrashHandler } from "../../src/main/crash-handler";

function stubLogger() {
	return {
		info: () => {},
		warn: () => {},
		error: () => {},
		flush: () => {},
		readRecent: () => ["line-1", "line-2"],
		close: () => {},
	};
}

describe("crash-handler", () => {
	let logsDir: string;
	const installed: Array<{
		event: "uncaughtException" | "unhandledRejection";
		handler:
			| NodeJS.UncaughtExceptionListener
			| NodeJS.UnhandledRejectionListener;
	}> = [];

	beforeEach(() => {
		logsDir = mkdtempSync(path.join(tmpdir(), "macpi-crash-"));
		electronExit.mockReset();
		electronShowErrorBox.mockReset();
		installed.length = 0;
	});

	afterEach(() => {
		rmSync(logsDir, { recursive: true, force: true });
		for (const { event, handler } of installed) {
			process.removeListener(event, handler as never);
		}
	});

	it("writes a crash-<ts>.log file containing stack + recent log lines", () => {
		const originalOn = process.on.bind(process);
		// Intercept to capture the handlers without actually registering them
		// on the real process (we don't want a test failure to bring down vitest).
		const captured = {
			uncaught: null as null | ((e: unknown) => void),
			rejection: null as null | ((e: unknown) => void),
		};
		const fakeOn = ((event: string, fn: (e: unknown) => void) => {
			if (event === "uncaughtException") captured.uncaught = fn;
			else if (event === "unhandledRejection") captured.rejection = fn;
			else originalOn(event as never, fn as never);
			return process;
		}) as typeof process.on;
		// biome-ignore lint/suspicious/noExplicitAny: test shim
		(process as any).on = fakeOn;

		try {
			installCrashHandler(stubLogger(), logsDir);
			expect(captured.uncaught).toBeTruthy();
			captured.uncaught?.(new Error("boom"));
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restore
			(process as any).on = originalOn;
		}

		const files = readdirSync(logsDir).filter((f) => f.startsWith("crash-"));
		expect(files).toHaveLength(1);
		const body = readFileSync(path.join(logsDir, files[0]), "utf8");
		expect(body).toMatch(/kind: uncaught/);
		expect(body).toMatch(/Error: boom/);
		expect(body).toMatch(/line-1/);
		expect(body).toMatch(/line-2/);
		expect(electronExit).toHaveBeenCalledWith(1);
	});

	it("does not re-enter the handler if it fires twice", () => {
		const captured = { uncaught: null as null | ((e: unknown) => void) };
		const originalOn = process.on.bind(process);
		// biome-ignore lint/suspicious/noExplicitAny: test shim
		(process as any).on = ((event: string, fn: (e: unknown) => void) => {
			if (event === "uncaughtException") captured.uncaught = fn;
			return process;
		}) as typeof process.on;
		try {
			installCrashHandler(stubLogger(), logsDir);
			captured.uncaught?.(new Error("first"));
			captured.uncaught?.(new Error("second"));
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restore
			(process as any).on = originalOn;
		}
		// Only the first call should have produced a file + exit.
		expect(
			readdirSync(logsDir).filter((f) => f.startsWith("crash-")),
		).toHaveLength(1);
		expect(electronExit).toHaveBeenCalledTimes(1);
	});
});
