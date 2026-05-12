// Orchestrates pi's session-tree primitives + sessions repo writes. Pure
// delegation to pi for read paths; for fork, also inserts a row into
// channel_sessions so the new pi session appears under the parent's channel
// in the renderer sidebar.

import type { BranchTreeSnapshot } from "../shared/branch-types";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import { projectTree } from "./tree-projection";

interface ActiveSessionMeta {
	channelId: string;
	cwd: string | null;
	sessionFilePath: string | null;
	label: string | null;
}

/**
 * Structural interface capturing the pi AgentSession/AgentSessionRuntime
 * surface that BranchService requires. Defined locally so BranchService is
 * not coupled to the exact class hierarchy of the pi SDK.
 */
interface BranchAgentSession {
	sessionManager: {
		getTree(): unknown[];
		getLeafId(): string | null;
		getLabel(id: string): string | undefined;
		appendLabelChange(targetId: string, label: string | undefined): string;
		getSessionId(): string;
		getSessionFile(): string | undefined;
	};
	navigateTree(
		targetId: string,
		options?: {
			summarize?: boolean;
			customInstructions?: string;
			replaceInstructions?: boolean;
			label?: string;
		},
	): Promise<{ editorText?: string; cancelled: boolean }>;
	fork(
		entryId: string,
		options?: { position?: "before" | "at" },
	): Promise<{ cancelled: boolean; selectedText?: string }>;
}

export interface BranchServiceDeps {
	getAgentSession: (piSessionId: string) => BranchAgentSession | undefined;
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

	async navigateTree(piSessionId: string, entryId: string): Promise<void> {
		const ags = this.requireAgentSession(piSessionId);
		const result = await ags.navigateTree(entryId);
		if (result.cancelled) {
			throw new Error(`navigate cancelled for ${entryId}`);
		}
	}

	async setEntryLabel(
		piSessionId: string,
		entryId: string,
		label: string,
	): Promise<void> {
		const ags = this.requireAgentSession(piSessionId);
		const value = label.length === 0 ? undefined : label;
		ags.sessionManager.appendLabelChange(entryId, value);
	}

	async fork(
		piSessionId: string,
		entryId: string,
		position: "before" | "at" = "at",
	): Promise<{ newSessionId: string }> {
		const ags = this.requireAgentSession(piSessionId);
		const meta = this.deps.piSessionManager.getActiveSessionMeta(piSessionId);
		if (!meta) {
			throw new Error(`branch session not found: ${piSessionId}`);
		}
		const result = await ags.fork(entryId, { position });
		if (result.cancelled) {
			throw new Error(`fork cancelled at ${entryId}`);
		}
		const newSessionId = ags.sessionManager.getSessionId();
		const newSessionFile = ags.sessionManager.getSessionFile() ?? null;
		this.deps.channelSessions.attach({
			channelId: meta.channelId,
			piSessionId: newSessionId,
			cwd: meta.cwd,
			sessionFilePath: newSessionFile,
		});
		return { newSessionId };
	}

	private requireAgentSession(piSessionId: string): BranchAgentSession {
		const ags = this.deps.getAgentSession(piSessionId);
		if (!ags) {
			throw new Error(`branch session not found: ${piSessionId}`);
		}
		return ags;
	}
}
