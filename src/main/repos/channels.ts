// ChannelsRepo: CRUD operations for the channels table.
// Channels are top-level groupings for pi sessions.

import { randomUUID } from "node:crypto";
import type { DbHandle } from "../db/connection";

export interface Channel {
	id: string;
	name: string;
	position: number;
	icon: string | null;
	createdAt: number;
}

export interface CreateChannelInput {
	name: string;
	icon?: string;
}

export class ChannelsRepo {
	constructor(private readonly db: DbHandle) {}

	create(input: CreateChannelInput): Channel {
		const id = randomUUID();
		const now = Date.now();
		const nextPos = this.nextPosition();
		this.db.raw
			.prepare(
				"INSERT INTO channels (id, name, position, icon, created_at) VALUES (?, ?, ?, ?, ?)",
			)
			.run(id, input.name, nextPos, input.icon ?? null, now);
		return {
			id,
			name: input.name,
			position: nextPos,
			icon: input.icon ?? null,
			createdAt: now,
		};
	}

	list(): Channel[] {
		const rows = this.db.raw
			.prepare(
				"SELECT id, name, position, icon, created_at as createdAt FROM channels ORDER BY position ASC",
			)
			.all() as unknown as Channel[];
		return rows;
	}

	getById(id: string): Channel | null {
		const row = this.db.raw
			.prepare(
				"SELECT id, name, position, icon, created_at as createdAt FROM channels WHERE id = ?",
			)
			.get(id) as unknown as Channel | undefined;
		return row ?? null;
	}

	rename(id: string, name: string): void {
		this.db.raw
			.prepare("UPDATE channels SET name = ? WHERE id = ?")
			.run(name, id);
	}

	delete(id: string): void {
		this.db.raw.prepare("DELETE FROM channels WHERE id = ?").run(id);
	}

	countSessions(channelId: string): number {
		const row = this.db.raw
			.prepare(
				"SELECT COUNT(*) AS n FROM channel_sessions WHERE channel_id = ?",
			)
			.get(channelId) as unknown as { n: number };
		return row.n;
	}

	private nextPosition(): number {
		const row = this.db.raw
			.prepare("SELECT MAX(position) AS max FROM channels")
			.get() as unknown as { max: number | null };
		return (row.max ?? -1) + 1;
	}
}
