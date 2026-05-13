import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotesService } from "../../src/main/notes-service";

describe("NotesService", () => {
	let dir: string;
	let filePath: string;

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "macpi-notes-"));
		filePath = path.join(dir, "NOTES.md");
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("creates an empty NOTES.md on first list when missing", async () => {
		const svc = new NotesService({ filePath });
		const result = await svc.list();
		expect(result.notes).toEqual([]);
		expect(result.preamble).toBe("");
		expect(existsSync(filePath)).toBe(true);
		expect(readFileSync(filePath, "utf8")).toBe("");
	});

	it("round-trips create → save → read → list", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		const save = await svc.save({
			id,
			blob: "hello\nbody here\nmore body",
		});
		expect(save.ok).toBe(true);

		const detail = await svc.read(id);
		expect(detail.title).toBe("hello");
		expect(detail.body).toBe("body here\nmore body");
		expect(detail.blob).toBe("hello\nbody here\nmore body");

		const listed = await svc.list();
		expect(listed.notes).toHaveLength(1);
		expect(listed.notes[0]?.title).toBe("hello");
	});

	it("save returns {ok:false,error:stale} when file changed externally", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		await svc.save({ id, blob: "first" });

		// Simulate an external edit by bumping mtime in the future.
		const future = new Date(Date.now() + 5000);
		utimesSync(filePath, future, future);

		const result = await svc.save({ id, blob: "second" });
		expect(result.ok).toBe(false);
		if (result.ok === false) {
			expect(result.error).toBe("stale");
		}
	});

	it("save with {force:true} bypasses the stale check", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		await svc.save({ id, blob: "first" });

		const future = new Date(Date.now() + 5000);
		utimesSync(filePath, future, future);

		const result = await svc.save({ id, blob: "forced", force: true });
		expect(result.ok).toBe(true);
		const detail = await svc.read(id);
		expect(detail.title).toBe("forced");
	});

	it("delete removes the section but preserves preamble + other notes", async () => {
		writeFileSync(
			filePath,
			"# header\n\n## first\nbody one\n\n## second\nbody two\n",
		);
		const svc = new NotesService({ filePath });
		const listed = await svc.list();
		const firstId = listed.notes[0]?.id;
		if (!firstId) throw new Error("expected first note id");

		const result = await svc.delete({ id: firstId });
		expect(result.ok).toBe(true);

		const after = await svc.list();
		expect(after.notes).toHaveLength(1);
		expect(after.notes[0]?.title).toBe("second");
		expect(after.preamble).toBe("# header\n\n");
	});

	it("most-recently-edited note moves to position 0", async () => {
		writeFileSync(filePath, "## one\nbody one\n## two\nbody two\n");
		const svc = new NotesService({ filePath });
		const listed = await svc.list();
		const secondId = listed.notes[1]?.id;
		if (!secondId) throw new Error("expected second note id");

		await svc.save({ id: secondId, blob: "two-edited\nnew body" });

		const after = await svc.list();
		expect(after.notes[0]?.title).toBe("two-edited");
		expect(after.notes[1]?.title).toBe("one");
	});

	it("creates an empty note that disappears unless saved with content", async () => {
		const svc = new NotesService({ filePath });
		await svc.create();
		const listed = await svc.list();
		// The in-memory list has the empty note for immediate selection,
		// but the file on disk does not yet contain it.
		expect(listed.notes).toHaveLength(1);
		expect(readFileSync(filePath, "utf8")).toBe("");
	});

	it("save on a stale file does not mutate in-memory state", async () => {
		const svc = new NotesService({ filePath });
		const { id } = await svc.create();
		await svc.save({ id, blob: "first version" });

		const future = new Date(Date.now() + 5000);
		utimesSync(filePath, future, future);

		const stale = await svc.save({ id, blob: "second version" });
		expect(stale.ok).toBe(false);

		// After the stale return, an in-memory read should still show
		// the pre-stale content — not the rejected new content.
		const detail = await svc.read(id);
		expect(detail.title).toBe("first version");
	});

	it("two consecutive create() calls both produce findable IDs", async () => {
		const svc = new NotesService({ filePath });
		const { id: firstId } = await svc.create();
		const { id: secondId } = await svc.create();
		expect(firstId).not.toBe(secondId);
		// Both empty placeholders should be readable.
		const first = await svc.read(firstId);
		expect(first.title).toBe("");
		const second = await svc.read(secondId);
		expect(second.title).toBe("");
	});
});
