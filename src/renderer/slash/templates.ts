// Adapter between the prompts service and the slash registry. Two pieces:
// templateCommands (synchronous shape mapping for the popup) and
// dispatchTemplate (async — fetches the body via IPC, expands args,
// returns a replace-action for the Composer).

import type { PromptSummary } from "../../shared/prompts-types";
import { expand } from "./expand";
import type { SlashAction, SlashCommand } from "./types";

export function templateCommands(prompts: PromptSummary[]): SlashCommand[] {
	return prompts.map((p) => ({
		name: p.name,
		description: p.description,
		argumentHint: p.argumentHint,
		kind: "template",
		availableDuringStream: true,
	}));
}

type InvokeFn = <M extends string>(
	method: M,
	args: unknown,
) => Promise<unknown>;

export async function dispatchTemplate(
	prompt: PromptSummary,
	args: string[],
	invoke: InvokeFn,
): Promise<SlashAction> {
	try {
		const res = (await invoke("prompts.read", { id: prompt.id })) as {
			body: string;
		};
		return { kind: "replace", text: expand(res.body, args) };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return { kind: "error", message: `Template not available: ${msg}` };
	}
}
