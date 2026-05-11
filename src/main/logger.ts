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
	readRecent(n: number): string[];
}

function dayString(d: Date): string {
	return d.toISOString().slice(0, 10);
}

export function createLogger(opts: LoggerOptions): Logger {
	const now = opts.now ?? (() => new Date());
	const retentionDays = opts.retentionDays ?? 7;
	fs.mkdirSync(opts.dir, { recursive: true });

	// Prune files older than retentionDays.
	const cutoff = now().getTime() - retentionDays * 24 * 60 * 60 * 1000;
	for (const name of fs.readdirSync(opts.dir)) {
		if (!name.startsWith(`${opts.stream}-`) || !name.endsWith(".log")) continue;
		const full = path.join(opts.dir, name);
		const stat = fs.statSync(full);
		if (stat.mtimeMs < cutoff) fs.unlinkSync(full);
	}

	let currentDay = "";
	let fd: number | null = null;

	function ensureOpen(): { fd: number; file: string } {
		const day = dayString(now());
		if (day !== currentDay) {
			if (fd !== null) {
				fs.closeSync(fd);
				fd = null;
			}
			currentDay = day;
		}
		const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
		if (fd === null) {
			fd = fs.openSync(file, "a");
		}
		return { fd, file };
	}

	function write(level: LogLevel, message: string) {
		const { fd: handle } = ensureOpen();
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
		readRecent(n: number): string[] {
			const day = dayString(now());
			const file = path.join(opts.dir, `${opts.stream}-${day}.log`);
			if (!fs.existsSync(file)) return [];
			const all = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
			return all.slice(-n);
		},
	};
}
