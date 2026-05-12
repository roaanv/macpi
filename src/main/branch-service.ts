// Orchestrates pi's session-tree primitives + sessions repo writes. Pure
// delegation to pi for read paths; for fork, also inserts a row into
// channel_sessions so the new pi session appears under the parent's channel
// in the renderer sidebar.

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { BranchTreeSnapshot } from "../shared/branch-types";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import { projectTree } from "./tree-projection";

interface ActiveSessionMeta {
	channelId: string;
	cwd: string | null;
	sessionFilePath: string | null;
	label: string | null;
}

export interface BranchServiceDeps {
	getAgentSession: (piSessionId: string) => AgentSession | undefined;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: {
		getActiveSessionMeta: (
			piSessionId: string,
		) => ActiveSessionMeta | undefined;
	};
}

export class BranchService {
	constructor(private readonly deps: BranchServiceDeps) {}

	async getTree(piSessionId: string): Promise<BranchTreeSnapshot> {
		const ags = this.requireAgentSession(piSessionId);
		// pi's getTree() returns SessionTreeNode[] with .entry, .children, .label.
		// We pass it directly to projectTree which only reads the documented fields.
		const roots = ags.sessionManager.getTree() as unknown as Parameters<
			typeof projectTree
		>[0]["roots"];
		const leafId = ags.sessionManager.getLeafId();
		return projectTree({ piSessionId, roots, leafId });
	}

	private requireAgentSession(piSessionId: string): AgentSession {
		const ags = this.deps.getAgentSession(piSessionId);
		if (!ags) {
			throw new Error(`branch session not found: ${piSessionId}`);
		}
		return ags;
	}
}
