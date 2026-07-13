// WorkspacesRepo: CRUD operations for the workspaces table.
// Workspaces are top-level groupings for pi sessions.

import { randomUUID } from "node:crypto";
import type { DbHandle } from "../db/connection";

export interface Workspace {
	id: string;
	name: string;
	position: number;
	icon: string | null;
	cwd: string | null;
	createdAt: number;
}

export interface CreateWorkspaceInput {
	name: string;
	icon?: string;
	cwd?: string | null;
}

export class WorkspacesRepo {
	constructor(private readonly db: DbHandle) {}

	create(input: CreateWorkspaceInput): Workspace {
		const id = randomUUID();
		const now = Date.now();
		const nextPos = this.nextPosition();
		const cwd = input.cwd ?? null;
		this.db.raw
			.prepare(
				"INSERT INTO workspaces (id, name, position, icon, cwd, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(id, input.name, nextPos, input.icon ?? null, cwd, now);
		return {
			id,
			name: input.name,
			position: nextPos,
			icon: input.icon ?? null,
			cwd,
			createdAt: now,
		};
	}

	list(): Workspace[] {
		return this.db.raw
			.prepare(
				"SELECT id, name, position, icon, cwd, created_at as createdAt FROM workspaces ORDER BY position ASC",
			)
			.all() as unknown as Workspace[];
	}

	getById(id: string): Workspace | null {
		const row = this.db.raw
			.prepare(
				"SELECT id, name, position, icon, cwd, created_at as createdAt FROM workspaces WHERE id = ?",
			)
			.get(id) as unknown as Workspace | undefined;
		return row ?? null;
	}

	rename(id: string, name: string): void {
		this.db.raw
			.prepare("UPDATE workspaces SET name = ? WHERE id = ?")
			.run(name, id);
	}

	delete(id: string): void {
		this.db.raw.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
	}

	setCwd(id: string, cwd: string | null): void {
		this.db.raw
			.prepare("UPDATE workspaces SET cwd = ? WHERE id = ?")
			.run(cwd, id);
	}

	countSessions(workspaceId: string): number {
		const row = this.db.raw
			.prepare(
				"SELECT COUNT(*) AS n FROM workspace_sessions WHERE workspace_id = ?",
			)
			.get(workspaceId) as unknown as { n: number };
		return row.n;
	}

	private nextPosition(): number {
		const row = this.db.raw
			.prepare("SELECT MAX(position) AS max FROM workspaces")
			.get() as unknown as { max: number | null };
		return (row.max ?? -1) + 1;
	}
}
