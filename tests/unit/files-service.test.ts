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
	fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "macpi-files-test-"));
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
	await fs.writeFile(path.join(fixtureRoot, "README.md"), "# Test fixture\n");
	// 2 MB text file
	await fs.writeFile(
		path.join(fixtureRoot, "big.txt"),
		"x".repeat(2 * 1024 * 1024),
	);
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
		expect(names).not.toContain("escape"); // symlink that resolves outside cwd
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
		await expect(service.readText(SID, "../escape.txt")).rejects.toMatchObject({
			code: "path_outside_cwd",
		});
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
