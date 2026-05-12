// Wire-format events sent from main → renderer over the macpi:pi-event channel.
// PiSessionManager translates @earendil-works/pi-coding-agent's AgentSessionEvent
// into these narrower shapes; the renderer's timeline state consumes them.
//
// Source of truth for the underlying pi event names is
// pi/packages/coding-agent/docs/json.md (research-only).

export type PiEvent =
	| { type: "session.turn_start"; piSessionId: string }
	| { type: "session.turn_end"; piSessionId: string }
	| { type: "session.text_delta"; piSessionId: string; delta: string }
	| { type: "session.thinking_delta"; piSessionId: string; delta: string }
	| {
			type: "session.tool_start";
			piSessionId: string;
			toolCallId: string;
			toolName: string;
			args: unknown;
	  }
	| {
			type: "session.tool_end";
			piSessionId: string;
			toolCallId: string;
			result: unknown;
			isError: boolean;
	  }
	| {
			type: "session.compaction_start";
			piSessionId: string;
			reason: "manual" | "threshold" | "overflow";
	  }
	| {
			type: "session.compaction_end";
			piSessionId: string;
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  }
	| {
			type: "session.retry_start";
			piSessionId: string;
			attempt: number;
			maxAttempts: number;
			delayMs: number;
			errorMessage: string;
	  }
	| {
			type: "session.retry_end";
			piSessionId: string;
			success: boolean;
			attempt: number;
			finalError?: string;
	  }
	| {
			type: "session.queue_update";
			piSessionId: string;
			steering: readonly string[];
			followUp: readonly string[];
	  }
	| {
			type: "session.error";
			piSessionId: string;
			code: "auth" | "model" | "transient" | "unknown";
			message: string;
	  }
	| {
			type: "session.tree";
			piSessionId: string;
			newLeafEntryId: string | null;
			oldLeafEntryId: string | null;
	  }
	| {
			type: "package.progress";
			action: "install" | "remove" | "update" | "clone" | "pull";
			source: string;
			phase: "start" | "progress" | "complete" | "error";
			message?: string;
	  };

export type PiEventType = PiEvent["type"];
