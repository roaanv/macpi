// Contract types for the slash-command pipeline. The SlashAction union is
// the boundary between the dispatcher (pure) and the Composer (React-stateful).

import type { IpcMethodName } from "../../shared/ipc-types";

export interface SlashCommand {
	/** Command name without the leading slash. e.g. "compact", "review". */
	name: string;
	description: string;
	/** e.g. "[prompt]", "<text>". Omitted when the command takes no args. */
	argumentHint?: string;
	kind: "builtin" | "template" | "skill";
	/** False = blocked during streaming; true = always available. */
	availableDuringStream: boolean;
}

export interface ParsedSlash {
	/** Name without the leading slash. May contain ":" (for /skill:name). */
	name: string;
	args: string[];
}

export type SlashAction =
	| { kind: "replace"; text: string }
	| { kind: "send"; text: string }
	| { kind: "run"; effect: () => void | Promise<void> }
	| { kind: "ipc"; method: IpcMethodName; args: unknown }
	| { kind: "block"; reason: string }
	| { kind: "error"; message: string };

export interface SlashDispatchCtx {
	streaming: boolean;
	piSessionId: string;
	channelId: string | null;
	lastAssistantText: () => string | null;
	openHelpDialog: () => void;
	showToast: (message: string) => void;
	clearComposerInput: () => void;
	onSessionCreated: (newPiSessionId: string) => void;
}
