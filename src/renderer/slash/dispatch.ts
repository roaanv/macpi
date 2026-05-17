// Dispatcher: takes a matched SlashCommand and its parsed args, plus the
// context object the Composer hands us, and returns a SlashAction the
// Composer can interpret. Pure with respect to the inputs — all side
// effects are encoded as the action variant.

import type {
	ParsedSlash,
	SlashAction,
	SlashCommand,
	SlashDispatchCtx,
} from "./types";

export function dispatch(
	cmd: SlashCommand,
	parsed: ParsedSlash,
	ctx: SlashDispatchCtx,
): SlashAction | null {
	if (cmd.kind === "skill") return null;

	if (!cmd.availableDuringStream && ctx.streaming) {
		return {
			kind: "block",
			reason: "Wait for the agent to finish",
		};
	}

	if (cmd.kind === "builtin") {
		return dispatchBuiltin(cmd.name, parsed.args, ctx);
	}

	// Template dispatch is async and lives in templates.ts. The Composer
	// special-cases this kind because it needs to call invoke() and await.
	return null;
}

function dispatchBuiltin(
	name: string,
	args: string[],
	ctx: SlashDispatchCtx,
): SlashAction | null {
	switch (name) {
		case "help":
			return { kind: "run", effect: ctx.openHelpDialog };

		case "clear":
			return { kind: "run", effect: ctx.clearComposerInput };

		case "copy":
			return {
				kind: "run",
				effect: async () => {
					const text = ctx.lastAssistantText();
					if (!text) {
						ctx.showToast("Nothing to copy");
						return;
					}
					await navigator.clipboard.writeText(text);
					ctx.showToast("Copied");
				},
			};

		case "new":
			if (!ctx.channelId) {
				return {
					kind: "run",
					effect: () => ctx.showToast("No active channel"),
				};
			}
			return {
				kind: "ipc",
				method: "session.create",
				args: {
					channelId: ctx.channelId,
					cwd: args[0],
				},
			};

		case "name":
			if (args.length === 0) {
				return {
					kind: "run",
					effect: () => ctx.showToast("Usage: /name <text>"),
				};
			}
			return {
				kind: "ipc",
				method: "session.rename",
				args: { piSessionId: ctx.piSessionId, label: args.join(" ") },
			};

		case "compact": {
			const prompt = args.length > 0 ? args.join(" ") : undefined;
			return {
				kind: "ipc",
				method: "session.compact",
				args: { piSessionId: ctx.piSessionId, prompt },
			};
		}

		case "reload":
			return {
				kind: "ipc",
				method: "session.reload",
				args: { piSessionId: ctx.piSessionId },
			};

		default:
			return null;
	}
}
