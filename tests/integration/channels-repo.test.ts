import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DbHandle, openDb } from "../../src/main/db/connection";
import { runMigrations } from "../../src/main/db/migrations";
import { ChannelSessionsRepo } from "../../src/main/repos/channel-sessions";
import { ChannelsRepo } from "../../src/main/repos/channels";

let dir: string;
let db: DbHandle;
let repo: ChannelsRepo;

beforeEach(() => {
	process.env.MACPI_MIGRATIONS_DIR = path.resolve(
		__dirname,
		"../../src/main/db/migrations",
	);
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-channels-"));
	db = openDb({ filename: path.join(dir, "test.db") });
	runMigrations(db);
	repo = new ChannelsRepo(db);
});

afterEach(() => {
	db.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe("ChannelsRepo", () => {
	it("creates a channel and lists it", () => {
		const c = repo.create({ name: "general" });
		expect(c.id).toBeTruthy();
		expect(c.name).toBe("general");
		const all = repo.list();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(c.id);
	});

	it("lists channels in `position` order", () => {
		const a = repo.create({ name: "a" });
		const b = repo.create({ name: "b" });
		const c = repo.create({ name: "c" });
		expect(repo.list().map((x) => x.id)).toEqual([a.id, b.id, c.id]);
	});

	it("renames a channel", () => {
		const c = repo.create({ name: "scratch" });
		repo.rename(c.id, "macpi-dev");
		expect(repo.list()[0].name).toBe("macpi-dev");
	});

	it("deletes a channel", () => {
		const c = repo.create({ name: "tmp" });
		repo.delete(c.id);
		expect(repo.list()).toHaveLength(0);
	});

	it("getById returns null for unknown channel", () => {
		expect(repo.getById("no-such-id")).toBeNull();
	});
});

describe("ChannelSessionsRepo", () => {
	let sessionsRepo: ChannelSessionsRepo;
	let channelId: string;

	beforeEach(() => {
		sessionsRepo = new ChannelSessionsRepo(db);
		channelId = repo.create({ name: "test" }).id;
	});

	it("attaches a pi session to a channel", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-session-abc",
			cwd: null,
			sessionFilePath: null,
		});
		const ids = sessionsRepo.listByChannel(channelId);
		expect(ids).toEqual(["pi-session-abc"]);
	});

	it("preserves attach order via position", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.attach({
			channelId,
			piSessionId: "s2",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.attach({
			channelId,
			piSessionId: "s3",
			cwd: null,
			sessionFilePath: null,
		});
		expect(sessionsRepo.listByChannel(channelId)).toEqual(["s1", "s2", "s3"]);
	});

	it("findChannelOf returns the owning channel", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		expect(sessionsRepo.findChannelOf("s1")).toBe(channelId);
		expect(sessionsRepo.findChannelOf("missing")).toBeNull();
	});

	it("detach removes the mapping", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.detach(channelId, "s1");
		expect(sessionsRepo.listByChannel(channelId)).toEqual([]);
	});

	it("deleting a channel cascades to channel_sessions", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.attach({
			channelId,
			piSessionId: "s2",
			cwd: null,
			sessionFilePath: null,
		});
		repo.delete(channelId);
		expect(sessionsRepo.listByChannel(channelId)).toEqual([]);
	});

	it("attach() persists cwd and session_file_path", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: "/tmp/work",
			sessionFilePath: "/Users/x/.pi/agent/sessions/abc/def.jsonl",
		});

		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta).toEqual({
			piSessionId: "pi-1",
			cwd: "/tmp/work",
			sessionFilePath: "/Users/x/.pi/agent/sessions/abc/def.jsonl",
		});
	});

	it("setSessionFilePath updates the path for an existing session", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-2",
			cwd: "/tmp/work2",
			sessionFilePath: null,
		});

		sessionsRepo.setSessionFilePath("pi-2", "/discovered/path.jsonl");
		expect(sessionsRepo.getMeta("pi-2")?.sessionFilePath).toBe(
			"/discovered/path.jsonl",
		);
	});

	it("getMeta returns null for an unknown session", () => {
		expect(sessionsRepo.getMeta("does-not-exist")).toBeNull();
	});
});
