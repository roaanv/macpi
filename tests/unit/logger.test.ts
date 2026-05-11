import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLogger, type Logger } from "../../src/main/logger";

describe("logger", () => {
	let dir: string;
	let loggers: Logger[];

	function makeLogger(...args: Parameters<typeof createLogger>): Logger {
		const log = createLogger(...args);
		loggers.push(log);
		return log;
	}

	beforeEach(() => {
		dir = mkdtempSync(path.join(tmpdir(), "macpi-log-"));
		loggers = [];
	});
	afterEach(() => {
		for (const log of loggers) log.close();
		rmSync(dir, { recursive: true, force: true });
	});

	it("writes a line to today's log file", () => {
		const log = makeLogger({
			dir,
			stream: "main",
			now: () => new Date("2026-05-11T10:00:00Z"),
		});
		log.info("hello");
		log.flush();
		const file = path.join(dir, "main-2026-05-11.log");
		expect(readFileSync(file, "utf8")).toMatch(/INFO\s+hello/);
	});

	it("rotates to a new file on a new day", () => {
		let now = new Date("2026-05-11T23:59:00Z");
		const log = makeLogger({ dir, stream: "main", now: () => now });
		log.info("day1");
		now = new Date("2026-05-12T00:01:00Z");
		log.info("day2");
		log.flush();
		expect(readFileSync(path.join(dir, "main-2026-05-11.log"), "utf8")).toMatch(
			/day1/,
		);
		expect(readFileSync(path.join(dir, "main-2026-05-12.log"), "utf8")).toMatch(
			/day2/,
		);
	});

	it("prunes files older than 7 days on init", () => {
		// Stale file: 10 days before "now". Also backdate mtime so this test
		// still catches a regression to mtime-based pruning.
		const stale = path.join(dir, "main-2026-05-01.log");
		writeFileSync(stale, "old\n");
		const tenDaysAgo = new Date("2026-05-01T00:00:00Z").getTime();
		utimesSync(stale, tenDaysAgo / 1000, tenDaysAgo / 1000);

		// In-retention file (1 day before "now") must survive.
		const fresh = path.join(dir, "main-2026-05-10.log");
		writeFileSync(fresh, "recent\n");

		makeLogger({
			dir,
			stream: "main",
			now: () => new Date("2026-05-11T10:00:00Z"),
		});
		expect(existsSync(stale)).toBe(false);
		expect(existsSync(fresh)).toBe(true);
	});

	it("readRecent returns the last N lines", () => {
		const log = makeLogger({
			dir,
			stream: "main",
			now: () => new Date("2026-05-11T10:00:00Z"),
		});
		for (let i = 0; i < 10; i++) log.info(`line-${i}`);
		log.flush();
		const tail = log.readRecent(3);
		expect(tail).toHaveLength(3);
		expect(tail[2]).toMatch(/line-9/);
	});
});
