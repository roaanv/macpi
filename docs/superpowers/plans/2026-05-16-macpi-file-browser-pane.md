# File Browser Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side resizable/collapsible pane to chat mode that browses the active pi session's working directory: a lazy-expand tree on top and a text-only preview on the bottom (markdown rendered, others as `<pre>`).

**Architecture:** Pure-fs `FilesService` in main with a path-traversal guard (realpath-the-cwd-then-prefix-check). Two new IPC methods (`files.listDir`, `files.readText`) returning structured `IpcResult`. `ResizablePane` gains a `side?: "left" | "right"` prop. Three new renderer components — `FileBrowserPane` (owns split height, expanded paths, selection, `showHidden`), `FileTree` (purely controlled, recursive), `FilePreview` (size short-circuit + markdown vs `<pre>` branch). Tree refresh hooks `useInvalidateOnTurnEnd` on `session.turn_end` / `session.compaction_end`.

**Tech Stack:** Electron 42, TypeScript, React 18, TanStack Query 5, Tailwind v3, Vitest 3, Biome v2, `node:fs/promises`, `node:path`, `node:os`. No new npm deps.

**Spec:** `docs/superpowers/specs/2026-05-16-file-browser-pane-design.md`.

---

## Pre-flight

Already on isolated worktree `file-browser` (HEAD `40a7781` — spec doc).

```bash
npm install
npm run typecheck && npm run lint && npm run test
```

Expected baseline: typecheck clean, biome clean, **370/370 tests passing**.

**Heads-up to implementers:** the in-editor LSP shows false positives (`Cannot find module '@earendil-works/...'`, JSX intrinsic elements unknown). **`npm run typecheck` is the ground truth** — ignore IDE-LSP noise.

---

## File Structure

```
src/shared/
  text-files.ts                                          [NEW]
  ipc-types.ts                                           [MODIFY: +FileEntry, +files.listDir, +files.readText]

src/main/
  files-service.ts                                       [NEW]
  ipc-router.ts                                          [MODIFY: +RouterDeps.filesService, +2 handlers]
  index.ts                                               [MODIFY: instantiate FilesService, pass to router]

src/renderer/
  queries.ts                                             [MODIFY: +useDirListing, +useFileContent]
  components/ResizablePane.tsx                           [MODIFY: +side prop]
  components/FileBrowserPane.tsx                         [NEW]
  components/FileTree.tsx                                [NEW]
  components/FilePreview.tsx                             [NEW]
  components/ChatPane.tsx                                [MODIFY: toggle button + mount pane]
  styles.css                                             [MODIFY: file-tree row styles]

tests/
  unit/text-files.test.ts                                [NEW]
  unit/files-service.test.ts                            [NEW]
```

Each task is one failing-test → impl → passing-test → commit cycle. No new pi-integration test.

---

## Phase A — Shared helpers

### Task 1: `text-files.ts` — extensions + ignored-names + predicates

**Files:**
- Create: `src/shared/text-files.ts`
- Create: `tests/unit/text-files.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/text-files.test.ts`:

```ts
// Unit tests for the text/markdown/hidden classification used by the file browser.

import { describe, expect, it } from "vitest";
import {
	IGNORED_NAMES,
	isMarkdownPath,
	isTextPath,
	shouldHide,
	TEXT_EXTENSIONS,
	TEXT_FILENAMES,
} from "../../src/shared/text-files";

describe("isTextPath", () => {
	it("returns true for allowlisted extensions, case-insensitively", () => {
		for (const name of ["a.md", "B.MD", "x.json", "y.ts", "z.YAML"]) {
			expect(isTextPath(name)).toBe(true);
		}
	});
	it("returns true for allowlisted bare filenames", () => {
		for (const name of ["Dockerfile", "Makefile", "LICENSE", "README"]) {
			expect(isTextPath(name)).toBe(true);
		}
	});
	it("returns true for dot-prefixed files whose extension is allowlisted", () => {
		expect(isTextPath(".env")).toBe(true);
		expect(isTextPath(".env.local")).toBe(true);
		expect(isTextPath(".gitignore")).toBe(true);
	});
	it("returns false for binary extensions", () => {
		for (const name of ["pic.png", "z.zip", "lib.so", "f.woff2", "v.mp4"]) {
			expect(isTextPath(name)).toBe(false);
		}
	});
	it("returns false for unknown extension-less files", () => {
		expect(isTextPath("random")).toBe(false);
	});
});

describe("isMarkdownPath", () => {
	it("matches .md and .markdown case-insensitively", () => {
		for (const name of ["a.md", "B.MD", "c.markdown", "D.MARKDOWN"]) {
			expect(isMarkdownPath(name)).toBe(true);
		}
	});
	it("rejects other text extensions", () => {
		for (const name of ["a.txt", "b.json", "c.ts"]) {
			expect(isMarkdownPath(name)).toBe(false);
		}
	});
});

describe("shouldHide", () => {
	it("hides dotfiles by default", () => {
		expect(shouldHide(".git", false)).toBe(true);
		expect(shouldHide(".env", false)).toBe(true);
	});
	it("hides IGNORED_NAMES entries by default", () => {
		expect(shouldHide("node_modules", false)).toBe(true);
		expect(shouldHide("dist", false)).toBe(true);
	});
	it("does not hide ordinary files", () => {
		expect(shouldHide("README.md", false)).toBe(false);
		expect(shouldHide("src", false)).toBe(false);
	});
	it("un-hides everything when showHidden is true", () => {
		expect(shouldHide(".git", true)).toBe(false);
		expect(shouldHide("node_modules", true)).toBe(false);
	});
});

describe("exported sets", () => {
	it("exposes TEXT_EXTENSIONS as a read-only Set of leading-dot strings", () => {
		expect(TEXT_EXTENSIONS.has(".md")).toBe(true);
		expect(TEXT_EXTENSIONS.has(".png")).toBe(false);
	});
	it("exposes TEXT_FILENAMES with case-preserved names", () => {
		expect(TEXT_FILENAMES.has("Dockerfile")).toBe(true);
	});
	it("exposes IGNORED_NAMES with common build-output folders", () => {
		expect(IGNORED_NAMES.has("node_modules")).toBe(true);
		expect(IGNORED_NAMES.has(".git")).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/text-files.test.ts
```

Expected: FAIL — `Cannot find module '../../src/shared/text-files'`.

- [ ] **Step 3: Implement `src/shared/text-files.ts`**

```ts
// Pure classification helpers shared between main (FilesService) and
// renderer (FileTree, FilePreview). No node-only or browser-only APIs —
// just string predicates over basenames.

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
	".txt",
	".md",
	".markdown",
	".json",
	".jsonc",
	".yaml",
	".yml",
	".toml",
	".csv",
	".tsv",
	".log",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".rs",
	".go",
	".rb",
	".java",
	".kt",
	".swift",
	".c",
	".cpp",
	".h",
	".hpp",
	".sh",
	".bash",
	".zsh",
	".sql",
	".css",
	".scss",
	".html",
	".htm",
	".xml",
	".gitignore",
	".env",
	".editorconfig",
]);

export const TEXT_FILENAMES: ReadonlySet<string> = new Set([
	"Dockerfile",
	"Makefile",
	"LICENSE",
	"README",
	"CHANGELOG",
	"NOTICE",
]);

export const IGNORED_NAMES: ReadonlySet<string> = new Set([
	"node_modules",
	".git",
	".DS_Store",
	".next",
	"dist",
	"build",
	"out",
	".vite",
	".turbo",
	".cache",
	".nuxt",
	".svelte-kit",
	".parcel-cache",
	".pytest_cache",
	"__pycache__",
]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

function lastExt(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return ""; // ".env" has dot at 0 — handled separately below
	return name.slice(dot).toLowerCase();
}

export function isTextPath(name: string): boolean {
	if (TEXT_FILENAMES.has(name)) return true;
	const ext = lastExt(name);
	if (ext && TEXT_EXTENSIONS.has(ext)) return true;
	// Dotfile-as-whole-name (e.g. ".env", ".gitignore"): the leading dot
	// IS the extension in our table.
	if (name.startsWith(".")) {
		const asExt = name.toLowerCase();
		if (TEXT_EXTENSIONS.has(asExt)) return true;
		// Compound dotfiles like ".env.local" — strip the suffix and re-check.
		const firstDot = name.indexOf(".", 1);
		if (firstDot > 0) {
			const prefix = name.slice(0, firstDot).toLowerCase();
			if (TEXT_EXTENSIONS.has(prefix)) return true;
		}
	}
	return false;
}

export function isMarkdownPath(name: string): boolean {
	const ext = lastExt(name);
	return MARKDOWN_EXTENSIONS.has(ext);
}

export function shouldHide(name: string, showHidden: boolean): boolean {
	if (showHidden) return false;
	if (name.startsWith(".")) return true;
	if (IGNORED_NAMES.has(name)) return true;
	return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/text-files.test.ts
```

Expected: PASS — all 15 assertions green.

- [ ] **Step 5: Run typecheck and lint**

```bash
npm run typecheck && npx biome check src/shared/text-files.ts tests/unit/text-files.test.ts
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/text-files.ts tests/unit/text-files.test.ts
git commit -m "feat(shared): text/hidden classification helpers for file browser"
```

---

## Phase B — Main: FilesService + IPC

### Task 2: Add IPC method types and `FileEntry`

**Files:**
- Modify: `src/shared/ipc-types.ts`

- [ ] **Step 1: Add types**

In `src/shared/ipc-types.ts`, near the other IPC-adjacent interfaces (after the existing imports block, before `IpcMethods`), add:

```ts
export interface FileEntry {
	/** basename only (no path separators). */
	name: string;
	/** Path relative to the session cwd. "" for the cwd itself. */
	relPath: string;
	kind: "file" | "dir";
	/** False for directories and non-allowlisted files. */
	isText: boolean;
	/** Byte size for files; 0 for directories. */
	sizeBytes: number;
}
```

Then add two entries to the `IpcMethods` interface (alphabetised-ish — place after the `extensions.*` block or wherever feels natural, but keep grouping consistent with the existing file):

```ts
"files.listDir": {
	req: { piSessionId: string; relPath: string; showHidden: boolean };
	res: { entries: FileEntry[] };
};
"files.readText": {
	req: { piSessionId: string; relPath: string };
	res: { content: string; sizeBytes: number };
};
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS (the methods aren't registered yet, but the registry only constrains what handlers and call-sites declare).

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-types.ts
git commit -m "feat(ipc): FileEntry + files.listDir/readText method types"
```

---

### Task 3: `FilesService` — listDir with path-traversal guard

**Files:**
- Create: `src/main/files-service.ts`
- Create: `tests/unit/files-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/files-service.test.ts`:

```ts
// Unit tests for FilesService — exercises listDir and readText against a
// real tmp filesystem. The path-traversal guard is the security-critical
// piece, so we hit it from multiple angles (relative ../, absolute /,
// symlink-escape).

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FilesService } from "../../src/main/files-service";

let fixtureRoot: string;
let service: FilesService;
const SID = "sid-1";

beforeAll(async () => {
	fixtureRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "macpi-files-test-"),
	);
	await fs.mkdir(path.join(fixtureRoot, "src"));
	await fs.writeFile(path.join(fixtureRoot, "src", "app.ts"), "export {};\n");
	await fs.writeFile(
		path.join(fixtureRoot, "src", "index.html"),
		"<!doctype html>",
	);
	await fs.mkdir(path.join(fixtureRoot, "node_modules"));
	await fs.writeFile(
		path.join(fixtureRoot, "node_modules", ".package-lock.json"),
		"{}",
	);
	await fs.mkdir(path.join(fixtureRoot, ".git"));
	await fs.writeFile(path.join(fixtureRoot, ".git", "HEAD"), "ref: refs/x");
	await fs.writeFile(
		path.join(fixtureRoot, "README.md"),
		"# Test fixture\n",
	);
	// 2 MB text file
	await fs.writeFile(path.join(fixtureRoot, "big.txt"), "x".repeat(2 * 1024 * 1024));
	await fs.writeFile(
		path.join(fixtureRoot, "binary.bin"),
		Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
	);
	// Symlink that escapes the fixture root.
	await fs.symlink(os.tmpdir(), path.join(fixtureRoot, "escape"));

	service = new FilesService({
		getSessionCwd: (id) => (id === SID ? fixtureRoot : null),
	});
});

afterAll(async () => {
	await fs.rm(fixtureRoot, { recursive: true, force: true });
});

describe("FilesService.listDir", () => {
	it("returns visible entries (sorted: dirs first, then files alpha)", async () => {
		const out = await service.listDir(SID, "", false);
		const names = out.entries.map((e) => e.name);
		// node_modules and .git hidden; escape (symlink) hidden because it
		// resolves outside; src dir first; then README.md, big.txt, binary.bin.
		expect(names[0]).toBe("src");
		expect(names).toContain("README.md");
		expect(names).not.toContain("node_modules");
		expect(names).not.toContain(".git");
	});

	it("includes hidden entries when showHidden=true", async () => {
		const out = await service.listDir(SID, "", true);
		const names = out.entries.map((e) => e.name);
		expect(names).toContain("node_modules");
		expect(names).toContain(".git");
	});

	it("marks dirs with kind=dir and isText=false", async () => {
		const out = await service.listDir(SID, "", false);
		const src = out.entries.find((e) => e.name === "src");
		expect(src?.kind).toBe("dir");
		expect(src?.isText).toBe(false);
	});

	it("marks text files with isText=true and sets sizeBytes", async () => {
		const out = await service.listDir(SID, "", false);
		const readme = out.entries.find((e) => e.name === "README.md");
		expect(readme?.kind).toBe("file");
		expect(readme?.isText).toBe(true);
		expect(readme?.sizeBytes).toBeGreaterThan(0);
	});

	it("marks binary files with isText=false", async () => {
		const out = await service.listDir(SID, "", false);
		const bin = out.entries.find((e) => e.name === "binary.bin");
		expect(bin?.isText).toBe(false);
	});

	it("rejects parent traversal with path_outside_cwd", async () => {
		await expect(service.listDir(SID, "../..", false)).rejects.toMatchObject({
			code: "path_outside_cwd",
		});
	});

	it("rejects absolute paths with path_outside_cwd", async () => {
		await expect(service.listDir(SID, "/etc", false)).rejects.toMatchObject({
			code: "path_outside_cwd",
		});
	});

	it("rejects symlink that escapes the cwd via realpath check", async () => {
		await expect(service.listDir(SID, "escape", false)).rejects.toMatchObject({
			code: "path_outside_cwd",
		});
	});

	it("rejects unknown session with no_cwd", async () => {
		await expect(service.listDir("nope", "", false)).rejects.toMatchObject({
			code: "no_cwd",
		});
	});

	it("rejects missing directory with not_found", async () => {
		await expect(
			service.listDir(SID, "does-not-exist", false),
		).rejects.toMatchObject({ code: "not_found" });
	});
});

describe("FilesService.readText", () => {
	it("returns file content for an allowlisted text file", async () => {
		const out = await service.readText(SID, "README.md");
		expect(out.content).toMatch(/^# Test fixture/);
		expect(out.sizeBytes).toBe(out.content.length);
	});

	it("rejects files larger than 1 MB with too_large", async () => {
		await expect(service.readText(SID, "big.txt")).rejects.toMatchObject({
			code: "too_large",
		});
	});

	it("rejects non-text files with binary", async () => {
		await expect(service.readText(SID, "binary.bin")).rejects.toMatchObject({
			code: "binary",
		});
	});

	it("rejects path traversal with path_outside_cwd", async () => {
		await expect(
			service.readText(SID, "../escape.txt"),
		).rejects.toMatchObject({ code: "path_outside_cwd" });
	});

	it("rejects missing files with not_found", async () => {
		await expect(service.readText(SID, "missing.md")).rejects.toMatchObject({
			code: "not_found",
		});
	});

	it("rejects unknown session with no_cwd", async () => {
		await expect(service.readText("nope", "README.md")).rejects.toMatchObject({
			code: "no_cwd",
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/files-service.test.ts
```

Expected: FAIL — `Cannot find module '../../src/main/files-service'`.

- [ ] **Step 3: Implement `src/main/files-service.ts`**

```ts
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

			const entryRel =
				relPath === "" ? d.name : path.join(relPath, d.name);

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
		const abs =
			relPath === "" ? cwdReal : path.resolve(cwdReal, relPath);
		let real: string;
		try {
			real = await fs.realpath(abs);
		} catch (e) {
			throw fsToFilesError(e);
		}
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
	if (code === "ENOENT") return new FilesError("not_found", "Not found");
	if (code === "EACCES" || code === "EPERM") {
		return new FilesError("permission_denied", "Permission denied");
	}
	return new FilesError(
		"not_found",
		`Filesystem error: ${(e as Error)?.message ?? "unknown"}`,
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/files-service.test.ts
```

Expected: PASS — all 16 assertions green.

- [ ] **Step 5: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/main/files-service.ts tests/unit/files-service.test.ts
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/files-service.ts tests/unit/files-service.test.ts
git commit -m "feat(main): FilesService with realpath-guarded listDir + readText"
```

---

### Task 4: Wire `FilesService` into the IPC router

**Files:**
- Modify: `src/main/ipc-router.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Extend `RouterDeps` and register handlers**

In `src/main/ipc-router.ts`, add an import near the other main-process service imports:

```ts
import { FilesError, type FilesService } from "./files-service";
```

Add `filesService: FilesService;` to the `RouterDeps` interface (near the other service properties).

Inside the constructor, after the last `register(...)` call (search for the existing prompts/extensions registrations as the natural neighbour), add:

```ts
this.register("files.listDir", async (args) => {
	try {
		const out = await this.deps.filesService.listDir(
			args.piSessionId,
			args.relPath,
			args.showHidden,
		);
		return ok(out);
	} catch (e) {
		if (e instanceof FilesError) return err(e.code, e.message);
		const msg = e instanceof Error ? e.message : String(e);
		this.deps.mainLogger.warn(`files.listDir failed: ${msg}`);
		return err("internal", msg);
	}
});
this.register("files.readText", async (args) => {
	try {
		const out = await this.deps.filesService.readText(
			args.piSessionId,
			args.relPath,
		);
		return ok(out);
	} catch (e) {
		if (e instanceof FilesError) return err(e.code, e.message);
		const msg = e instanceof Error ? e.message : String(e);
		this.deps.mainLogger.warn(`files.readText failed: ${msg}`);
		return err("internal", msg);
	}
});
```

- [ ] **Step 2: Instantiate in `src/main/index.ts`**

Add the import near the other main-process service imports:

```ts
import { FilesService } from "./files-service";
```

After `branchService` is constructed and before `router = new IpcRouter({...})`, instantiate the service:

```ts
const filesService = new FilesService({
	getSessionCwd: (id) => channelSessions.getMeta(id)?.cwd ?? null,
});
```

Add `filesService,` to the `RouterDeps` object literal that's handed to `new IpcRouter({...})`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
npx biome check src/main/ipc-router.ts src/main/index.ts
```

Expected: clean.

- [ ] **Step 5: Re-run all tests**

```bash
npm test
```

Expected: no regressions; baseline test count grows by 31 (15 from Task 1, 16 from Task 3).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-router.ts src/main/index.ts
git commit -m "feat(main): register files.listDir/readText with FilesService"
```

---

## Phase C — Renderer plumbing

### Task 5: Renderer query hooks

**Files:**
- Modify: `src/renderer/queries.ts`

- [ ] **Step 1: Add the two hooks**

Append the following to `src/renderer/queries.ts` (after the other `useQuery`-based hooks, e.g. after `useSessionMeta`):

```ts
/**
 * Lazily lists one folder's children under the session cwd. The query key
 * includes `showHidden` so toggling it doesn't share a cache with the
 * filtered list. Disabled when no session is selected.
 */
export function useDirListing(
	piSessionId: string | null,
	relPath: string,
	showHidden: boolean,
) {
	return useQuery({
		queryKey: ["files.listDir", piSessionId, relPath, showHidden] as const,
		queryFn: () =>
			piSessionId
				? invoke("files.listDir", { piSessionId, relPath, showHidden })
				: Promise.resolve({ entries: [] }),
		enabled: !!piSessionId,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/**
 * Loads the content of one text file under the session cwd. Disabled when
 * either input is null. Refresh is owned by the calling component via
 * `useInvalidateOnTurnEnd`.
 */
export function useFileContent(
	piSessionId: string | null,
	relPath: string | null,
) {
	return useQuery({
		queryKey: ["files.readText", piSessionId, relPath] as const,
		queryFn: () =>
			piSessionId && relPath
				? invoke("files.readText", { piSessionId, relPath })
				: Promise.resolve({ content: "", sizeBytes: 0 }),
		enabled: !!piSessionId && !!relPath,
		staleTime: Number.POSITIVE_INFINITY,
	});
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/queries.ts
```

Expected: both clean (the IPC method types from Task 2 satisfy `invoke()`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/queries.ts
git commit -m "feat(renderer): useDirListing + useFileContent hooks"
```

---

### Task 6: `ResizablePane` — add `side` prop

**Files:**
- Modify: `src/renderer/components/ResizablePane.tsx`

- [ ] **Step 1: Add the prop and invert drag delta + handle position when `side="left"`**

Edit `ResizablePane.tsx`. Replace the `ResizablePaneProps` interface and the component body to thread `side` through. The full replacement for the component (props + body) is below — leave the helper `readPersisted` and the storage prefix untouched:

```tsx
interface ResizablePaneProps {
	/** Unique key under "macpi:pane-width:" for localStorage persistence. */
	storageKey: string;
	defaultWidth: number;
	minWidth?: number;
	maxWidth?: number;
	/** Which edge the drag handle sits on. Default "right". */
	side?: "left" | "right";
	children: React.ReactNode;
}

export function ResizablePane({
	storageKey,
	defaultWidth,
	minWidth = 180,
	maxWidth = 600,
	side = "right",
	children,
}: ResizablePaneProps) {
	const [width, setWidth] = React.useState<number>(() =>
		readPersisted(storageKey, defaultWidth, minWidth, maxWidth),
	);
	const dragRef = React.useRef<{ startX: number; startWidth: number } | null>(
		null,
	);

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		dragRef.current = { startX: e.clientX, startWidth: width };
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		// Right-anchored pane: dragging right grows it.
		// Left-anchored pane (handle on its left edge): dragging right shrinks it.
		const rawDelta = e.clientX - dragRef.current.startX;
		const delta = side === "left" ? -rawDelta : rawDelta;
		const next = Math.min(
			Math.max(dragRef.current.startWidth + delta, minWidth),
			maxWidth,
		);
		setWidth(next);
	};

	const persist = React.useCallback(
		(value: number) => {
			try {
				window.localStorage.setItem(
					`${STORAGE_PREFIX}${storageKey}`,
					String(value),
				);
			} catch {
				// localStorage can be disabled — failing silently is fine here.
			}
		},
		[storageKey],
	);

	const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragRef.current) return;
		dragRef.current = null;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// Pointer capture may already have been released by the browser.
		}
		persist(width);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
		e.preventDefault();
		const step = e.shiftKey ? 24 : 8;
		// Arrow keys grow/shrink the pane regardless of which edge the handle is on:
		// right-pointing arrow always grows the pane.
		const baseDirection = e.key === "ArrowLeft" ? -1 : 1;
		const direction = side === "left" ? -baseDirection : baseDirection;
		const next = Math.min(
			Math.max(width + direction * step, minWidth),
			maxWidth,
		);
		setWidth(next);
		persist(next);
	};

	const handleClass =
		side === "left"
			? "absolute left-0 top-0 h-full w-1 cursor-col-resize outline-none hover:bg-indigo-500/50 focus-visible:bg-indigo-500/50 active:bg-indigo-500/70"
			: "absolute right-0 top-0 h-full w-1 cursor-col-resize outline-none hover:bg-indigo-500/50 focus-visible:bg-indigo-500/50 active:bg-indigo-500/70";

	return (
		<div className="relative flex h-full flex-shrink-0" style={{ width }}>
			<div className="flex h-full w-full min-w-0">{children}</div>
			{/* biome-ignore lint/a11y/useSemanticElements: WAI-ARIA's window-splitter
				pattern uses an interactive role="separator" on a div; <hr> doesn't
				accept the pointer/keyboard handlers needed for drag-to-resize. */}
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize pane"
				aria-valuenow={width}
				aria-valuemin={minWidth}
				aria-valuemax={maxWidth}
				tabIndex={0}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				onKeyDown={onKeyDown}
				className={handleClass}
			/>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint + tests (regression check)**

```bash
npm run typecheck && npx biome check src/renderer/components/ResizablePane.tsx && npm test
```

Expected: clean; no existing call-sites pass `side`, so they keep the default `"right"`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ResizablePane.tsx
git commit -m "feat(ui): ResizablePane gains side prop for left/right anchoring"
```

---

## Phase D — UI components

### Task 7: `FilePreview` — markdown vs `<pre>` with size short-circuit

**Files:**
- Create: `src/renderer/components/FilePreview.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/FilePreview.tsx`:

```tsx
// Bottom half of the file browser pane. Renders the currently-selected
// file. Three branches:
//   1. sizeBytes > 1MB → short-circuit before the IPC call. (Backend
//      enforces the same cap, but we save a round-trip and let the user
//      know without thrashing the network.)
//   2. Markdown extension → MarkdownText (the same renderer chat uses,
//      so links route through shell.openExternal, scripts can't escape).
//   3. Anything else → <pre> with the monospace font token.
//
// Errors surface inline. They clear automatically when the user selects
// a different file, because that changes the query key.

import React from "react";
import { useFileContent } from "../queries";
import { isMarkdownPath } from "../../shared/text-files";
import { MarkdownText } from "./messages/MarkdownText";

const MAX_BYTES = 1_048_576;

export function FilePreview({
	piSessionId,
	selectedPath,
	sizeBytes,
}: {
	piSessionId: string | null;
	selectedPath: string | null;
	sizeBytes: number;
}) {
	const overCap = sizeBytes > MAX_BYTES;
	const query = useFileContent(
		piSessionId,
		overCap ? null : selectedPath,
	);

	if (!selectedPath) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
				Select a file to preview.
			</div>
		);
	}
	if (overCap) {
		return (
			<div className="px-3 py-2 text-sm text-muted">
				File too large to preview ({sizeBytes.toLocaleString()} bytes; cap{" "}
				{MAX_BYTES.toLocaleString()}).
			</div>
		);
	}
	if (query.isLoading) {
		return <div className="px-3 py-2 text-sm text-muted">Loading…</div>;
	}
	if (query.isError) {
		const msg =
			query.error instanceof Error
				? query.error.message
				: String(query.error);
		return (
			<div className="px-3 py-2 text-sm text-red-300">Error: {msg}</div>
		);
	}
	const content = query.data?.content ?? "";

	if (isMarkdownPath(selectedPath)) {
		return (
			<div className="overflow-auto px-3 py-2">
				<MarkdownText text={content} />
			</div>
		);
	}
	return (
		<pre
			className="h-full overflow-auto px-3 py-2 text-xs"
			style={{
				fontFamily: "var(--font-mono)",
				tabSize: 4,
			}}
		>
			{content}
		</pre>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/components/FilePreview.tsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/FilePreview.tsx
git commit -m "feat(ui): FilePreview — markdown + <pre> + too-large short-circuit"
```

---

### Task 8: `FileTree` — purely controlled recursive tree

**Files:**
- Create: `src/renderer/components/FileTree.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/FileTree.tsx`:

```tsx
// Recursive file tree. Purely controlled — all state (which folders are
// expanded, which file is selected) lives in FileBrowserPane and is
// passed in. That lets refresh re-render without unmounting children,
// and means a fork could share state with another tree.
//
// Rendering rules from the spec:
//   - Dirs first, then files, alpha within each group (FilesService sorts).
//   - Non-text files at 50% opacity, not selectable.
//   - Folder rows show ▸ / ▾ toggle.
//   - Indent is 12px per depth level.

import React from "react";
import type { FileEntry } from "../../shared/ipc-types";
import { useDirListing } from "../queries";

interface FileTreeProps {
	piSessionId: string;
	relPath: string;
	depth: number;
	showHidden: boolean;
	expandedPaths: ReadonlySet<string>;
	selectedPath: string | null;
	onToggleExpand: (relPath: string) => void;
	onSelect: (entry: FileEntry) => void;
}

export function FileTree(props: FileTreeProps) {
	const {
		piSessionId,
		relPath,
		depth,
		showHidden,
		expandedPaths,
		selectedPath,
		onToggleExpand,
		onSelect,
	} = props;
	const query = useDirListing(piSessionId, relPath, showHidden);

	if (query.isLoading) {
		return (
			<div
				className="px-2 py-1 text-xs text-muted"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				Loading…
			</div>
		);
	}
	if (query.isError) {
		const code = (query.error as { code?: string } | null)?.code;
		const msg =
			code === "permission_denied"
				? "(no permission)"
				: code === "not_found"
					? "(missing)"
					: code === "path_outside_cwd"
						? "(blocked)"
						: "(error)";
		return (
			<div
				className="px-2 py-1 text-xs text-red-300"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				{msg}
			</div>
		);
	}
	const entries = query.data?.entries ?? [];
	if (entries.length === 0 && depth > 0) {
		return (
			<div
				className="px-2 py-1 text-xs text-muted"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				(empty)
			</div>
		);
	}

	return (
		<>
			{entries.map((entry) =>
				entry.kind === "dir" ? (
					<DirRow
						key={entry.relPath}
						entry={entry}
						depth={depth}
						isExpanded={expandedPaths.has(entry.relPath)}
						onToggle={() => onToggleExpand(entry.relPath)}
					>
						{expandedPaths.has(entry.relPath) && (
							<FileTree
								piSessionId={piSessionId}
								relPath={entry.relPath}
								depth={depth + 1}
								showHidden={showHidden}
								expandedPaths={expandedPaths}
								selectedPath={selectedPath}
								onToggleExpand={onToggleExpand}
								onSelect={onSelect}
							/>
						)}
					</DirRow>
				) : (
					<FileRow
						key={entry.relPath}
						entry={entry}
						depth={depth}
						isSelected={entry.relPath === selectedPath}
						onSelect={() => entry.isText && onSelect(entry)}
					/>
				),
			)}
		</>
	);
}

function DirRow({
	entry,
	depth,
	isExpanded,
	onToggle,
	children,
}: {
	entry: FileEntry;
	depth: number;
	isExpanded: boolean;
	onToggle: () => void;
	children?: React.ReactNode;
}) {
	return (
		<>
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs hover:bg-white/5"
				style={{ paddingLeft: depth * 12 + 8 }}
			>
				<span className="inline-block w-3 text-muted">
					{isExpanded ? "▾" : "▸"}
				</span>
				<span>{entry.name}</span>
			</button>
			{children}
		</>
	);
}

function FileRow({
	entry,
	depth,
	isSelected,
	onSelect,
}: {
	entry: FileEntry;
	depth: number;
	isSelected: boolean;
	onSelect: () => void;
}) {
	const className = [
		"flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs",
		entry.isText ? "hover:bg-white/5" : "opacity-50 cursor-default",
		isSelected ? "bg-indigo-500/20" : "",
	].join(" ");
	return (
		<button
			type="button"
			onClick={onSelect}
			disabled={!entry.isText}
			className={className}
			style={{ paddingLeft: depth * 12 + 8 + 12 /* align past ▸ */ }}
		>
			<span>{entry.name}</span>
		</button>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/components/FileTree.tsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/FileTree.tsx
git commit -m "feat(ui): FileTree — recursive controlled tree with lazy expand"
```

---

### Task 9: `FileBrowserPane` — owns state, mounts tree + preview

**Files:**
- Create: `src/renderer/components/FileBrowserPane.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/FileBrowserPane.tsx`:

```tsx
// Right-side pane in chat mode. Owns:
//   - selectedPath: which file is highlighted in the tree and rendered
//     in the preview.
//   - selectedSizeBytes: tracked from the FileEntry that was clicked so
//     FilePreview can short-circuit the >1MB case without a round trip.
//   - expandedPaths: which folders are open (in-memory per pane mount;
//     resets when piSessionId changes).
//   - showHidden: a session-scoped toggle that exposes dotfiles and
//     IGNORED_NAMES entries.
//   - splitPct: top sub-pane height as a percentage (persisted to
//     localStorage so it survives reloads).
//
// Refresh: subscribes to pi events for the active session via
// useInvalidateOnTurnEnd and invalidates BOTH query prefixes
// (files.listDir, files.readText) on every turn_end / compaction_end.

import React from "react";
import type { FileEntry } from "../../shared/ipc-types";
import { useInvalidateOnTurnEnd } from "../queries";
import { useQueryClient } from "@tanstack/react-query";
import { ResizablePane } from "./ResizablePane";
import { FilePreview } from "./FilePreview";
import { FileTree } from "./FileTree";

const SPLIT_STORAGE_KEY = "macpi:pane-height:files-tree";
const DEFAULT_SPLIT_PCT = 50;
const MIN_SPLIT_PCT = 20;
const MAX_SPLIT_PCT = 80;

function readSplit(): number {
	try {
		const raw = window.localStorage.getItem(SPLIT_STORAGE_KEY);
		if (!raw) return DEFAULT_SPLIT_PCT;
		const n = Number.parseFloat(raw);
		if (!Number.isFinite(n)) return DEFAULT_SPLIT_PCT;
		return Math.min(Math.max(n, MIN_SPLIT_PCT), MAX_SPLIT_PCT);
	} catch {
		return DEFAULT_SPLIT_PCT;
	}
}

function writeSplit(pct: number) {
	try {
		window.localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
	} catch {
		// localStorage may be disabled.
	}
}

export function FileBrowserPane({
	piSessionId,
	sessionCwd,
	onClose,
}: {
	piSessionId: string;
	sessionCwd: string | null;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
	const [selectedSizeBytes, setSelectedSizeBytes] = React.useState<number>(0);
	const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(
		() => new Set(),
	);
	const [showHidden, setShowHidden] = React.useState(false);
	const [splitPct, setSplitPct] = React.useState<number>(() => readSplit());

	// Reset everything when the session changes — the tree is rooted at the
	// new cwd and the old selection is meaningless.
	// biome-ignore lint/correctness/useExhaustiveDependencies: piSessionId is the trigger; setters are stable
	React.useEffect(() => {
		setSelectedPath(null);
		setSelectedSizeBytes(0);
		setExpandedPaths(new Set());
	}, [piSessionId]);

	// Refresh both query prefixes after every pi turn. The list-dir queries
	// share a prefix tuple so one invalidate covers every depth.
	useInvalidateOnTurnEnd(piSessionId, ["files.listDir", piSessionId]);
	useInvalidateOnTurnEnd(piSessionId, ["files.readText", piSessionId]);

	const onToggleExpand = React.useCallback((relPath: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(relPath)) next.delete(relPath);
			else next.add(relPath);
			return next;
		});
	}, []);

	const onSelectFile = React.useCallback((entry: FileEntry) => {
		setSelectedPath(entry.relPath);
		setSelectedSizeBytes(entry.sizeBytes);
	}, []);

	const refreshAll = React.useCallback(() => {
		qc.invalidateQueries({ queryKey: ["files.listDir", piSessionId] });
		qc.invalidateQueries({ queryKey: ["files.readText", piSessionId] });
	}, [qc, piSessionId]);

	const splitDragRef = React.useRef<{
		startY: number;
		startPct: number;
		containerH: number;
	} | null>(null);

	const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		const containerEl = (e.currentTarget.parentElement
			?.parentElement as HTMLElement | null) ?? null;
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		splitDragRef.current = {
			startY: e.clientY,
			startPct: splitPct,
			containerH: rect.height,
		};
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};
	const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!splitDragRef.current) return;
		const { startY, startPct, containerH } = splitDragRef.current;
		const deltaPct = ((e.clientY - startY) / containerH) * 100;
		const next = Math.min(
			Math.max(startPct + deltaPct, MIN_SPLIT_PCT),
			MAX_SPLIT_PCT,
		);
		setSplitPct(next);
	};
	const onSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!splitDragRef.current) return;
		splitDragRef.current = null;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// already released
		}
		writeSplit(splitPct);
	};

	const body = !sessionCwd ? (
		<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
			This session has no working directory.
		</div>
	) : (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="flex items-center gap-1 border-b border-white/5 px-2 py-1 text-xs">
				<span className="truncate text-muted" title={sessionCwd}>
					{sessionCwd}
				</span>
				<div className="ml-auto flex items-center gap-1">
					<label className="flex items-center gap-1 text-muted">
						<input
							type="checkbox"
							checked={showHidden}
							onChange={(e) => setShowHidden(e.target.checked)}
						/>
						hidden
					</label>
					<button
						type="button"
						onClick={refreshAll}
						className="rounded px-1 hover:bg-white/5"
						title="Refresh"
					>
						⟳
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded px-1 hover:bg-white/5"
						title="Close pane"
					>
						✕
					</button>
				</div>
			</div>
			{/* Tree */}
			<div
				className="overflow-auto"
				style={{ height: `${splitPct}%` }}
			>
				<FileTree
					piSessionId={piSessionId}
					relPath=""
					depth={0}
					showHidden={showHidden}
					expandedPaths={expandedPaths}
					selectedPath={selectedPath}
					onToggleExpand={onToggleExpand}
					onSelect={onSelectFile}
				/>
			</div>
			{/* Horizontal splitter */}
			{/* biome-ignore lint/a11y/useSemanticElements: same rationale as ResizablePane */}
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label="Resize tree / preview split"
				aria-valuenow={splitPct}
				aria-valuemin={MIN_SPLIT_PCT}
				aria-valuemax={MAX_SPLIT_PCT}
				tabIndex={0}
				onPointerDown={onSplitPointerDown}
				onPointerMove={onSplitPointerMove}
				onPointerUp={onSplitPointerUp}
				onPointerCancel={onSplitPointerUp}
				className="h-1 w-full cursor-row-resize bg-white/5 hover:bg-indigo-500/50 active:bg-indigo-500/70"
			/>
			{/* Preview */}
			<div
				className="min-h-0 flex-1 overflow-hidden"
				style={{ height: `${100 - splitPct}%` }}
			>
				<FilePreview
					piSessionId={piSessionId}
					selectedPath={selectedPath}
					sizeBytes={selectedSizeBytes}
				/>
			</div>
		</div>
	);

	return (
		<ResizablePane
			storageKey="files"
			defaultWidth={320}
			minWidth={240}
			maxWidth={720}
			side="left"
		>
			<div className="flex h-full w-full flex-col border-l border-white/5 bg-black/10">
				{body}
			</div>
		</ResizablePane>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

```bash
npm run typecheck && npx biome check src/renderer/components/FileBrowserPane.tsx
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/FileBrowserPane.tsx
git commit -m "feat(ui): FileBrowserPane — owns split, expansion, selection, refresh"
```

---

## Phase E — Chat integration

### Task 10: Toggle + mount in `ChatPane`

**Files:**
- Modify: `src/renderer/components/ChatPane.tsx`

- [ ] **Step 1: Persisted toggle + mount**

Edit `src/renderer/components/ChatPane.tsx`:

1. Add the import alongside the other component imports:

```ts
import { FileBrowserPane } from "./FileBrowserPane";
```

2. Inside `ChatPane({...})`, just after the `useSessionMeta` / `useSessionChannel` lines, add the persisted toggle state:

```tsx
const [filesOpen, setFilesOpen] = React.useState<boolean>(() => {
	try {
		return window.localStorage.getItem("macpi:pane-open:files") === "1";
	} catch {
		return false;
	}
});
React.useEffect(() => {
	try {
		window.localStorage.setItem(
			"macpi:pane-open:files",
			filesOpen ? "1" : "0",
		);
	} catch {
		// localStorage may be disabled — toggle still works for this session.
	}
}, [filesOpen]);
```

3. Wrap the return so the chat column and the pane sit side-by-side. Replace the existing `return (...)` block with:

```tsx
return (
	<div className="flex flex-1 min-h-0">
		<div className="flex flex-1 flex-col surface-app p-4 min-w-0">
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0">
					<ChatBreadcrumb
						channelName={channelName}
						sessionName={sessionMeta.data?.label ?? null}
					/>
					<BreadcrumbBar
						channelName={channelName}
						piSessionId={piSessionId}
						cwd={sessionMeta.data?.cwd ?? null}
						label={sessionMeta.data?.label ?? null}
					/>
				</div>
				<button
					type="button"
					onClick={() => setFilesOpen((v) => !v)}
					className="mt-1 rounded px-2 py-1 text-xs hover:bg-white/5"
					title={filesOpen ? "Hide file browser" : "Show file browser"}
					aria-pressed={filesOpen}
				>
					📁
				</button>
			</div>
			<Timeline
				entries={snapshot.timeline}
				piSessionId={piSessionId}
				onForkNavigate={onSelectSession}
			/>
			<div className="mt-2 space-y-2">
				<ErrorBanner
					key={piSessionId ?? "no-session"}
					state={snapshot.errorBanner}
					onOpenSettings={onOpenGlobalSettings}
				/>
				<SkillsChangedBanner
					changed={snapshot.skillsChanged}
					reloading={reload.isPending}
					onReload={() => piSessionId && reload.mutate({ piSessionId })}
				/>
				<RetryBanner retry={snapshot.retry} />
				<CompactionBanner
					compaction={snapshot.compaction}
					lastResult={snapshot.lastCompactionResult}
				/>
				<QueuePills
					queue={snapshot.queue}
					onClear={() => {
						if (!piSessionId) return;
						clearQueueMutation.mutate({ piSessionId });
					}}
					onRemove={(queue, index) => {
						if (!piSessionId) return;
						removeFromQueueMutation.mutate({ piSessionId, queue, index });
					}}
				/>
			</div>
			<Composer
				streaming={snapshot.streaming}
				onSend={send}
				messageHistory={messageHistory}
			/>
			<ChatFooter piSessionId={piSessionId} />
			<ChatContextBar piSessionId={piSessionId} />
		</div>
		{filesOpen && (
			<FileBrowserPane
				piSessionId={piSessionId}
				sessionCwd={sessionMeta.data?.cwd ?? null}
				onClose={() => setFilesOpen(false)}
			/>
		)}
	</div>
);
```

(The pre-existing return wrapped everything in a single `flex flex-1 flex-col` div — the new shape adds an outer row so the file pane can flow next to the chat column. The early-return guard for `!piSessionId` and the loading/error guards above remain untouched.)

- [ ] **Step 2: Typecheck + lint + tests**

```bash
npm run typecheck && npx biome check src/renderer/components/ChatPane.tsx && npm test
```

Expected: typecheck clean, biome clean, all tests pass (no UI tests touch ChatPane).

- [ ] **Step 3: Run the app and verify visually**

```bash
npm start
```

- Open a channel with a session whose cwd points at a real directory.
- Click the 📁 button — pane appears on the right, headers show the cwd.
- Click a folder — verify lazy expand.
- Click `node_modules` — should not be visible. Toggle "hidden" — appears.
- Click `README.md` in the project root (this repo) — preview renders markdown.
- Click `src/renderer/components/ChatPane.tsx` — preview renders monospace.
- Drag the vertical handle on the pane's left edge — pane resizes.
- Drag the horizontal bar in the middle of the pane — tree/preview split shifts.
- Close the pane with ✕, reload, reopen with 📁 — width and split persist.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ChatPane.tsx
git commit -m "feat(chat): mount file browser pane behind 📁 toggle"
```

---

## Phase F — Documentation

### Task 11: Update spec status + manual-smoke note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-16-file-browser-pane-design.md`

- [ ] **Step 1: Bump status from approved → shipped**

In `docs/superpowers/specs/2026-05-16-file-browser-pane-design.md`, replace:

```markdown
**Status:** approved
```

with:

```markdown
**Status:** shipped
```

- [ ] **Step 2: Append plan reference and smoke-test result**

Append a new section at the bottom of the spec:

```markdown
## 9. Implementation

Implemented per `docs/superpowers/plans/2026-05-16-macpi-file-browser-pane.md`.
Manual smoke per §6 completed against this repo's cwd; tree, preview,
markdown rendering, lazy expand, refresh on turn_end, hidden toggle,
pane resize, and split resize all verified.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-file-browser-pane-design.md
git commit -m "docs: mark file-browser spec as shipped"
```

---

## Wrap-up

After all 11 tasks are complete:

```bash
npm run typecheck && npm run lint && npm test
```

Expected: typecheck clean, biome clean, **401/401 tests passing** (370 baseline + 15 text-files + 16 files-service).

```bash
git log --oneline file-browser ^main
```

Expected: 11 commits on top of the spec commit (`40a7781`).

Ready to merge `file-browser` into `main`.
