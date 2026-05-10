// ChannelSessionsRepo: manages the many-to-one mapping between pi sessions and channels.
// Cascade deletes are handled by the database ON DELETE CASCADE constraint.

import type { DbHandle } from "../db/connection";

export class ChannelSessionsRepo {
	constructor(private readonly db: DbHandle) {}

	attach(channelId: string, piSessionId: string): void {
		const nextPos = this.nextPosition(channelId);
		this.db.raw
			.prepare(
				"INSERT INTO channel_sessions (channel_id, pi_session_id, position, added_at) VALUES (?, ?, ?, ?)",
			)
			.run(channelId, piSessionId, nextPos, Date.now());
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

	private nextPosition(channelId: string): number {
		const row = this.db.raw
			.prepare(
				"SELECT MAX(position) AS max FROM channel_sessions WHERE channel_id = ?",
			)
			.get(channelId) as unknown as { max: number | null };
		return (row.max ?? -1) + 1;
	}
}
