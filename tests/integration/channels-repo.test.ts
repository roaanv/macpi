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

	it("countSessions returns 0 for an empty channel", () => {
		const c = repo.create({ name: "empty" });
		expect(repo.countSessions(c.id)).toBe(0);
	});

	it("countSessions returns the number of attached sessions", () => {
		const c = repo.create({ name: "busy" });
		const sr = new ChannelSessionsRepo(db);
		sr.attach({
			channelId: c.id,
			piSessionId: "s1",
			cwd: null,
			sessionFilePath: null,
		});
		sr.attach({
			channelId: c.id,
			piSessionId: "s2",
			cwd: null,
			sessionFilePath: null,
		});
		expect(repo.countSessions(c.id)).toBe(2);
	});

	it("create returns cwd as null by default", () => {
		const c = repo.create({ name: "x" });
		expect(c.cwd).toBeNull();
	});

	it("setCwd persists the cwd value", () => {
		const c = repo.create({ name: "x" });
		repo.setCwd(c.id, "/Users/x/code/macpi");
		expect(repo.getById(c.id)?.cwd).toBe("/Users/x/code/macpi");
	});

	it("setCwd with null clears the cwd", () => {
		const c = repo.create({ name: "x" });
		repo.setCwd(c.id, "/Users/x/code/macpi");
		repo.setCwd(c.id, null);
		expect(repo.getById(c.id)?.cwd).toBeNull();
	});

	it("list includes cwd on each channel", () => {
		const a = repo.create({ name: "a" });
		const b = repo.create({ name: "b" });
		repo.setCwd(b.id, "/path");
		const all = repo.list();
		expect(all.find((c) => c.id === a.id)?.cwd).toBeNull();
		expect(all.find((c) => c.id === b.id)?.cwd).toBe("/path");
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
			label: null,
			labelUserSet: false,
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

	it("setLabel stores a user-set label and flags label_user_set=1", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: "/tmp/work",
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "my session");
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBe("my session");
		expect(meta?.labelUserSet).toBe(true);
	});

	it("setLabel with empty string clears the label and unsets the flag", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "named");
		sessionsRepo.setLabel("pi-1", "");
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBeNull();
		expect(meta?.labelUserSet).toBe(false);
	});

	it("setFirstMessageLabel writes when label_user_set=0", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: "/Users/x/mycode/macpi",
			sessionFilePath: null,
		});
		const applied = sessionsRepo.setFirstMessageLabel(
			"pi-1",
			"macpi: fix the build",
		);
		expect(applied).toBe(true);
		const meta = sessionsRepo.getMeta("pi-1");
		expect(meta?.label).toBe("macpi: fix the build");
		expect(meta?.labelUserSet).toBe(false);
	});

	it("setFirstMessageLabel is a no-op when label_user_set=1", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.setLabel("pi-1", "user named me");
		const applied = sessionsRepo.setFirstMessageLabel(
			"pi-1",
			"should be ignored",
		);
		expect(applied).toBe(false);
		expect(sessionsRepo.getMeta("pi-1")?.label).toBe("user named me");
	});

	it("delete removes a single channel_sessions row", () => {
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-1",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.attach({
			channelId,
			piSessionId: "pi-2",
			cwd: null,
			sessionFilePath: null,
		});
		sessionsRepo.delete("pi-1");
		expect(sessionsRepo.listByChannel(channelId)).toEqual(["pi-2"]);
	});
});
