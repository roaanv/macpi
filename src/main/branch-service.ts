// Orchestrates pi's session-tree primitives + sessions repo writes. Pure
// delegation to pi for read paths; for fork, also inserts a row into
// channel_sessions so the new pi session appears under the parent's channel
// in the renderer sidebar.

import type { BranchTreeSnapshot } from "../shared/branch-types";
import type { PiEvent } from "../shared/pi-events";
import type { ChannelSessionsRepo } from "./repos/channel-sessions";
import { projectTree } from "./tree-projection";

interface ActiveSessionMeta {
	channelId: string;
	cwd: string | null;
	sessionFilePath: string | null;
	label: string | null;
}

/**
 * Structural interface capturing the pi AgentSession surface that
 * BranchService requires. Defined locally so BranchService is not coupled
 * to the exact class hierarchy of the pi SDK.
 *
 * Note: pi's fork() is NOT on AgentSession — it lives on AgentSessionRuntime
 * and replaces the runtime's current session. macpi keeps the parent session
 * alive alongside the fork, so we drive the fork at a lower level via
 * sessionManager.createBranchedSession + attachSessionByFile instead.
 */
export interface BranchAgentSession {
	sessionManager: {
		getTree(): unknown[];
		getLeafId(): string | null;
		getLabel(id: string): string | undefined;
		appendLabelChange(targetId: string, label: string | undefined): string;
		getSessionId(): string;
		getSessionFile(): string | undefined;
		getEntry(id: string): PiEntryLike | undefined;
		createBranchedSession(leafId: string): string | undefined;
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
}

interface PiEntryLike {
	id: string;
	type: string;
	parentId: string | null;
	message?: { role?: string };
}

export interface BranchServiceDeps {
	getAgentSession: (piSessionId: string) => BranchAgentSession | undefined;
	channelSessions: ChannelSessionsRepo;
	piSessionManager: {
		getActiveSessionMeta: (
			piSessionId: string,
		) => ActiveSessionMeta | undefined;
		attachSessionByFile: (filePath: string) => Promise<{ piSessionId: string }>;
	};
	// Emits a PiEvent to all renderer subscribers. Used to synthesize
	// `session.tree` after navigateTree completes — pi's own session_tree
	// event flows through the extension runtime channel which we don't
	// subscribe to, so we surface it ourselves.
	emitEvent: (event: PiEvent) => void;
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
		const oldLeafEntryId = ags.sessionManager.getLeafId();
		const result = await ags.navigateTree(entryId);
		if (result.cancelled) {
			throw new Error(`navigate cancelled for ${entryId}`);
		}
		const newLeafEntryId = ags.sessionManager.getLeafId();
		this.deps.emitEvent({
			type: "session.tree",
			piSessionId,
			newLeafEntryId,
			oldLeafEntryId,
		});
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

		// Resolve the leaf the new branch should end at. Mirrors pi's
		// AgentSessionRuntime.fork logic so "before" on a user message rewinds
		// to its parent (the typical "edit this message and re-send" gesture)
		// while "at" snapshots the conversation including that entry.
		const selectedEntry = ags.sessionManager.getEntry(entryId);
		if (!selectedEntry) {
			throw new Error(`entry not found: ${entryId}`);
		}
		let targetLeafId: string | null;
		if (position === "at") {
			targetLeafId = selectedEntry.id;
		} else {
			if (
				selectedEntry.type !== "message" ||
				selectedEntry.message?.role !== "user"
			) {
				throw new Error(
					`fork before is only valid on user messages: ${entryId}`,
				);
			}
			targetLeafId = selectedEntry.parentId;
		}
		if (!targetLeafId) {
			throw new Error("fork target resolves to null (cannot fork at root)");
		}

		// createBranchedSession writes a new session file containing the
		// root→targetLeafId path and returns its absolute path. Pi's high-level
		// runtime.fork additionally tears down the current session — we don't
		// want that, since macpi keeps the parent session alive next to the
		// new fork in the sidebar.
		const newSessionFile =
			ags.sessionManager.createBranchedSession(targetLeafId);
		if (!newSessionFile) {
			throw new Error("createBranchedSession returned no file path");
		}

		const attached =
			await this.deps.piSessionManager.attachSessionByFile(newSessionFile);
		const newSessionId = attached.piSessionId;

		const parentDisplay = meta.label ?? piSessionId.slice(0, 6);
		const defaultLabel = `${parentDisplay} · ${newSessionId.slice(0, 6)}`;
		this.deps.channelSessions.attach({
			channelId: meta.channelId,
			piSessionId: newSessionId,
			cwd: meta.cwd,
			sessionFilePath: newSessionFile,
			parentPiSessionId: piSessionId,
			label: defaultLabel,
			labelUserSet: true,
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
