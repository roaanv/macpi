// ChannelSessionsRepo: manages the many-to-one mapping between pi sessions and channels.
// Cascade deletes are handled by the database ON DELETE CASCADE constraint.

import type { DbHandle } from "../db/connection";

export interface AttachArgs {
	channelId: string;
	piSessionId: string;
	cwd: string | null;
	sessionFilePath: string | null;
}

export interface SessionMeta {
	piSessionId: string;
	cwd: string | null;
	sessionFilePath: string | null;
}

export class ChannelSessionsRepo {
	constructor(private readonly db: DbHandle) {}

	attach(args: AttachArgs): void {
		const nextPos = this.nextPosition(args.channelId);
		this.db.raw
			.prepare(
				"INSERT INTO channel_sessions (channel_id, pi_session_id, position, added_at, cwd, session_file_path) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				args.channelId,
				args.piSessionId,
				nextPos,
				Date.now(),
				args.cwd,
				args.sessionFilePath,
			);
	}

	detach(channelId: string, piSessionId: string): void {
		this.db.raw
			.prepare(
				"DELETE FROM channel_sessions WHERE channel_id = ? AND pi_session_id = ?",
			)
			.run(channelId, piSessionId);
	}

	listByChannel(channelId: string): string[] {
		const rows = this.db.raw
			.prepare(
				"SELECT pi_session_id AS piSessionId FROM channel_sessions WHERE channel_id = ? ORDER BY position ASC",
			)
			.all(channelId) as unknown as Array<{ piSessionId: string }>;
		return rows.map((r) => r.piSessionId);
	}

	findChannelOf(piSessionId: string): string | null {
		const row = this.db.raw
			.prepare(
				"SELECT channel_id AS channelId FROM channel_sessions WHERE pi_session_id = ?",
			)
			.get(piSessionId) as unknown as { channelId: string } | undefined;
		return row?.channelId ?? null;
	}

	getMeta(piSessionId: string): SessionMeta | null {
		const row = this.db.raw
			.prepare(
				"SELECT pi_session_id AS piSessionId, cwd, session_file_path AS sessionFilePath FROM channel_sessions WHERE pi_session_id = ?",
			)
			.get(piSessionId) as unknown as
			| {
					piSessionId: string;
					cwd: string | null;
					sessionFilePath: string | null;
			  }
			| undefined;
		if (!row) return null;
		return {
			piSessionId: row.piSessionId,
			cwd: row.cwd,
			sessionFilePath: row.sessionFilePath,
		};
	}

	setSessionFilePath(piSessionId: string, path: string): void {
		this.db.raw
			.prepare(
				"UPDATE channel_sessions SET session_file_path = ? WHERE pi_session_id = ?",
			)
			.run(path, piSessionId);
	}

	private nextPosition(channelId: string): number {
		const row = this.db.raw
			.prepare(
				"SELECT MAX(position) AS max FROM channel_sessions WHERE channel_id = ?",
			)
			.get(channelId) as unknown as { max: number | null };
		return (row.max ?? -1) + 1;
	}
}
