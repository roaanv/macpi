// Line-oriented log file writer with daily rotation. Used by main + the
// in-process pi adapter. Renderer logs flow through an IPC method that
// also routes here. Crash reports include the last N lines via readRecent().

import fs from "node:fs";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";
export type LogStream = "main" | "renderer";

interface LoggerOptions {
	dir: string;
	stream: LogStream;
	now?: () => Date;
	retentionDays?: number;
}

export interface Logger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
	flush(): void;
	close(): void;
	readRecent(n: number): string[];
}

function dayString(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function createLogger(opts: LoggerOptions): Logger {
	const now = opts.now ?? (() => new Date());
	const retentionDays = opts.retentionDays ?? 7;
	fs.mkdirSync(opts.dir, { recursive: true });

	// Prune files older than retentionDays based on the date encoded in the
	// filename (`<stream>-YYYY-MM-DD.log`). Filename date is the source of
	// truth because mtime can drift (touch, restore-from-backup, etc.).
	const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
	for (const name of fs.readdirSync(opts.dir)) {
		if (!name.startsWith(`${opts.stream}-`) || !name.endsWith(".log")) continue;
		const match = name.match(/^[^-]+-(\d{4}-\d{2}-\d{2})\.log$/);
		if (!match) continue;
		const fileDate = new Date(match[1]).getTime();
		if (fileDate < cutoff) fs.unlinkSync(path.join(opts.dir, name));
	}

	let currentDay = "";
	let fd: number | null = null;

	function ensureOpen(): number {
		const day = dayString(now());
		if (day !== currentDay) {
			if (fd !== null) {
				fs.closeSync(fd);
				fd = null;
			}
			currentDay = day;
		}
		if (fd === null) {
			const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
			fd = fs.openSync(file, "a");
		}
		return fd;
	}

	function write(level: LogLevel, message: string) {
		const handle = ensureOpen();
		const line = `${now().toISOString()} ${level.toUpperCase()} ${message}\n`;
		fs.writeSync(handle, line);
	}

	return {
		info: (m) => write("info", m),
		warn: (m) => write("warn", m),
		error: (m) => write("error", m),
		flush() {
			if (fd !== null) fs.fsyncSync(fd);
		},
		close() {
			if (fd !== null) {
				fs.closeSync(fd);
				fd = null;
			}
		},
		readRecent(n: number): string[] {
			// fsync any buffered writes so callers (e.g. the crash reporter)
			// see the most recent lines, not a stale on-disk tail.
			if (fd !== null) fs.fsyncSync(fd);
			const day = dayString(now());
			const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
			if (!fs.existsSync(file)) return [];
			const all = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
			return all.slice(-n);
		},
	};
}
