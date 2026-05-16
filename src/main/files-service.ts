// Pure-fs walker that serves the file browser pane. Two operations:
// listDir (returns visible entries for a folder under the session cwd)
// and readText (returns file contents for an allowlisted text file
// under 1 MB). Every call passes through the same path-traversal guard:
// realpath the cwd once, resolve the requested path, realpath that,
// then verify the result is still within cwd. This catches relative
// `../..` walks, absolute paths, and symlink escapes.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { FileEntry } from "../shared/ipc-types";
import { isTextPath, shouldHide } from "../shared/text-files";

const MAX_BYTES = 1_048_576;

export type FilesErrorCode =
	| "no_cwd"
	| "not_found"
	| "path_outside_cwd"
	| "binary"
	| "too_large"
	| "permission_denied";

export class FilesError extends Error {
	constructor(
		public readonly code: FilesErrorCode,
		message: string,
	) {
		super(message);
		this.name = "FilesError";
	}
}

export interface ListDirResult {
	entries: FileEntry[];
}

export interface ReadTextResult {
	content: string;
	sizeBytes: number;
}

interface FilesServiceDeps {
	getSessionCwd: (piSessionId: string) => string | null;
}

export class FilesService {
	constructor(private readonly deps: FilesServiceDeps) {}

	async listDir(
		piSessionId: string,
		relPath: string,
		showHidden: boolean,
	): Promise<ListDirResult> {
		const { abs, cwdReal } = await this.resolveSafe(piSessionId, relPath);

		let dirents: import("node:fs").Dirent[];
		try {
			dirents = await fs.readdir(abs, { withFileTypes: true });
		} catch (e) {
			throw fsToFilesError(e);
		}

		const entries: FileEntry[] = [];
		for (const d of dirents) {
			if (shouldHide(d.name, showHidden)) continue;

			// For symlinks, resolve and check the target stays inside cwd.
			// If it escapes, drop silently from the listing (don't 500 the
			// whole folder over one bad link).
			let kind: FileEntry["kind"];
			let entryRealAbs = path.join(abs, d.name);
			let stat: import("node:fs").Stats | null = null;
			if (d.isSymbolicLink()) {
				try {
					entryRealAbs = await fs.realpath(entryRealAbs);
					if (
						entryRealAbs !== cwdReal &&
						!entryRealAbs.startsWith(cwdReal + path.sep)
					) {
						continue;
					}
					stat = await fs.stat(entryRealAbs);
					kind = stat.isDirectory() ? "dir" : "file";
				} catch {
					continue; // broken or inaccessible symlink — skip
				}
			} else if (d.isDirectory()) {
				kind = "dir";
			} else if (d.isFile()) {
				kind = "file";
				try {
					stat = await fs.stat(entryRealAbs);
				} catch {
					continue;
				}
			} else {
				// Sockets, FIFOs, block/char devices — not browseable.
				continue;
			}

			const entryRel = relPath === "" ? d.name : path.join(relPath, d.name);

			entries.push({
				name: d.name,
				relPath: entryRel,
				kind,
				isText: kind === "file" && isTextPath(d.name),
				sizeBytes: kind === "file" && stat ? stat.size : 0,
			});
		}

		entries.sort((a, b) => {
			if (a.kind === "dir" && b.kind !== "dir") return -1;
			if (a.kind !== "dir" && b.kind === "dir") return 1;
			return a.name.localeCompare(b.name);
		});
		return { entries };
	}

	async readText(
		piSessionId: string,
		relPath: string,
	): Promise<ReadTextResult> {
		const { abs } = await this.resolveSafe(piSessionId, relPath);
		const base = path.basename(abs);
		if (!isTextPath(base)) {
			throw new FilesError("binary", `Not a text file: ${base}`);
		}
		let stat: import("node:fs").Stats;
		try {
			stat = await fs.stat(abs);
		} catch (e) {
			throw fsToFilesError(e);
		}
		if (stat.isDirectory()) {
			throw new FilesError("binary", `Not a file: ${path.basename(abs)}`);
		}
		if (stat.size > MAX_BYTES) {
			throw new FilesError(
				"too_large",
				`File too large: ${stat.size} bytes (cap ${MAX_BYTES})`,
			);
		}
		let content: string;
		try {
			content = await fs.readFile(abs, "utf8");
		} catch (e) {
			throw fsToFilesError(e);
		}
		return { content, sizeBytes: stat.size };
	}

	private async resolveSafe(
		piSessionId: string,
		relPath: string,
	): Promise<{ abs: string; cwdReal: string }> {
		const cwdRaw = this.deps.getSessionCwd(piSessionId);
		if (!cwdRaw) {
			throw new FilesError("no_cwd", "Session has no working directory");
		}
		let cwdReal: string;
		try {
			cwdReal = await fs.realpath(cwdRaw);
		} catch (e) {
			throw fsToFilesError(e);
		}
		if (relPath.includes("\0")) {
			throw new FilesError("path_outside_cwd", "relPath contains null byte");
		}
		const abs = relPath === "" ? cwdReal : path.resolve(cwdReal, relPath);
		// Lexical check first — catches `../foo`, `/etc/...`, and any
		// nonexistent-target traversal before realpath can fail with ENOENT.
		if (abs !== cwdReal && !abs.startsWith(cwdReal + path.sep)) {
			throw new FilesError(
				"path_outside_cwd",
				`Refusing to access path outside session cwd: ${relPath}`,
			);
		}
		let real: string;
		try {
			real = await fs.realpath(abs);
		} catch (e) {
			throw fsToFilesError(e);
		}
		// Realpath check catches symlink escapes that the lexical check misses.
		if (real !== cwdReal && !real.startsWith(cwdReal + path.sep)) {
			throw new FilesError(
				"path_outside_cwd",
				`Refusing to access path outside session cwd: ${relPath}`,
			);
		}
		return { abs: real, cwdReal };
	}
}

function fsToFilesError(e: unknown): FilesError {
	const code = (e as { code?: string })?.code;
	const msg = (e as Error)?.message ?? "unknown";
	if (code === "ENOENT") return new FilesError("not_found", "Not found");
	if (code === "EACCES" || code === "EPERM") {
		return new FilesError("permission_denied", "Permission denied");
	}
	if (code === "ENOTDIR" || code === "EISDIR") {
		return new FilesError("not_found", `${code}: ${msg}`);
	}
	return new FilesError(
		"not_found",
		`Filesystem error (${code ?? "no-code"}): ${msg}`,
	);
}
