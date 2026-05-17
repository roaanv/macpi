// Composer for the chat pane. Owns the input + Send / Steer / Queue buttons.
// Outside streaming: a single Send button. During streaming: Steer (interrupt)
// and Queue (after current turn) buttons; the user can keep typing while the
// agent is mid-turn.
//
// Also owns the slash-command trigger: when input parses as a slash command
// the SlashPopup opens, ArrowUp/Down/Tab/Enter/Esc are intercepted, and the
// dispatcher loop interprets the resulting SlashAction.

import React from "react";
import { useToast } from "../hooks/use-toast";
import { invoke } from "../ipc";
import { usePrompts, useSkills } from "../queries";
import { dispatch } from "../slash/dispatch";
import { parse } from "../slash/parse";
import { builtinCommands, match } from "../slash/registry";
import { skillCommands } from "../slash/skills";
import { dispatchTemplate, templateCommands } from "../slash/templates";
import type { SlashCommand } from "../slash/types";
import { navigateComposerHistory } from "../utils/composer-history";
import { resolveComposerKeyAction } from "../utils/composer-keyboard";
import { SlashPopup } from "./SlashPopup";

export type SendIntent = "send" | "steer" | "followUp";

export interface ComposerProps {
	streaming: boolean;
	onSend: (text: string, intent: SendIntent) => Promise<void>;
	messageHistory?: readonly string[];
	// Slash-command wiring (new):
	piSessionId: string | null;
	channelId: string | null;
	lastAssistantText: () => string | null;
	openHelpDialog: () => void;
	onSessionCreated: (newPiSessionId: string) => void;
}

export function Composer({
	streaming,
	onSend,
	messageHistory = [],
	piSessionId,
	channelId,
	lastAssistantText,
	openHelpDialog,
	onSessionCreated,
}: ComposerProps) {
	const [input, setInput] = React.useState("");
	const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
	const [slashOpen, setSlashOpen] = React.useState(false);
	const [slashHighlight, setSlashHighlight] = React.useState(0);
	// Holds the input text that was suppressed by Esc or a skill pick.
	// While input still equals this, the popup stays closed; typing or
	// editing changes input and clears the suppression so the popup
	// re-opens on the next slash trigger.
	const suppressedFor = React.useRef<string | null>(null);
	const prompts = usePrompts();
	const skills = useSkills();
	const { showToast } = useToast();

	const allCommands = React.useMemo(
		() => [
			...builtinCommands(),
			...templateCommands(prompts.data?.prompts ?? []),
			...skillCommands(skills.data?.skills ?? []),
		],
		[prompts.data, skills.data],
	);

	const parsedQuery = React.useMemo(() => parse(input), [input]);
	const matches = React.useMemo(
		() => (parsedQuery ? match(parsedQuery.name, allCommands) : []),
		[parsedQuery, allCommands],
	);

	// Open the popup whenever the input parses as a slash trigger, unless
	// the user has explicitly dismissed it for this exact text (via Esc
	// or a skill pick). Editing the text clears suppression.
	React.useEffect(() => {
		if (suppressedFor.current !== null && suppressedFor.current !== input) {
			suppressedFor.current = null;
		}
		const shouldOpen = parsedQuery !== null && suppressedFor.current !== input;
		setSlashOpen(shouldOpen);
		if (!shouldOpen) setSlashHighlight(0);
	}, [parsedQuery, input]);

	// Clamp highlight if matches shrinks below current index.
	// biome-ignore lint/correctness/useExhaustiveDependencies: matches.length is the trigger; slashHighlight check guards against unnecessary updates
	React.useEffect(() => {
		if (slashHighlight >= matches.length) setSlashHighlight(0);
	}, [matches.length]);

	async function submit(intent: SendIntent) {
		const text = input.trim();
		if (!text) return;
		setInput("");
		setHistoryIndex(null);
		await onSend(text, intent);
	}

	function defaultIntent(): SendIntent {
		// Pressing Enter dispatches the default action:
		// - not streaming → "send"
		// - streaming → "followUp" (the safer default; doesn't interrupt the agent)
		return streaming ? "followUp" : "send";
	}

	function onFormSubmit(e: React.FormEvent) {
		e.preventDefault();
		void submit(defaultIntent());
	}

	function clearInput() {
		setInput("");
		setHistoryIndex(null);
	}

	function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
		setInput(e.target.value);
		if (
			historyIndex !== null &&
			messageHistory[historyIndex] !== e.target.value
		) {
			setHistoryIndex(null);
		}
	}

	async function runSlash(cmd: SlashCommand) {
		if (!parsedQuery || !piSessionId) return;

		// Templates: async — fetches body via prompts.read IPC then expands.
		if (cmd.kind === "template") {
			const summary = prompts.data?.prompts.find((p) => p.name === cmd.name);
			if (!summary) {
				showToast("Template not found");
				return;
			}
			const action = await dispatchTemplate(
				summary,
				parsedQuery.args,
				invoke as <M extends string>(
					method: M,
					args: unknown,
				) => Promise<unknown>,
			);
			if (action.kind === "replace") {
				setInput(action.text);
				setSlashOpen(false);
			} else if (action.kind === "error") {
				showToast(action.message);
			}
			return;
		}

		const action = dispatch(cmd, parsedQuery, {
			streaming,
			piSessionId,
			channelId,
			lastAssistantText,
			openHelpDialog,
			showToast,
			clearComposerInput: clearInput,
			onSessionCreated,
		});
		if (action === null) {
			// Skill: leave input intact, close popup, user can hit Enter to send.
			// Suppress re-open for this exact input so Enter actually fires
			// submit() instead of reopening the popup.
			suppressedFor.current = input;
			setSlashOpen(false);
			return;
		}
		switch (action.kind) {
			case "block":
				showToast(action.reason);
				return;
			case "error":
				showToast(action.message);
				return;
			case "run":
				try {
					await action.effect();
				} catch (e) {
					showToast(e instanceof Error ? e.message : String(e));
				}
				clearInput();
				setSlashOpen(false);
				return;
			case "ipc":
				try {
					const res = await invoke(
						action.method as never,
						action.args as never,
					);
					if (
						action.method === "session.create" &&
						res &&
						typeof res === "object" &&
						"piSessionId" in res
					) {
						onSessionCreated((res as { piSessionId: string }).piSessionId);
					}
				} catch (e) {
					showToast(e instanceof Error ? e.message : String(e));
				}
				clearInput();
				setSlashOpen(false);
				return;
			case "replace":
				setInput(action.text);
				setSlashOpen(false);
				return;
			case "send":
				await onSend(action.text, defaultIntent());
				clearInput();
				setSlashOpen(false);
				return;
		}
	}

	function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (slashOpen) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSlashHighlight((i) =>
					matches.length === 0 ? 0 : (i + 1) % matches.length,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSlashHighlight((i) =>
					matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
				);
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				if (matches.length > 0) {
					e.preventDefault();
					void runSlash(matches[slashHighlight]);
					return;
				}
				// No matches → no-op (don't send literal "/foo" as a message).
				e.preventDefault();
				return;
			}
			if (e.key === "Tab") {
				if (matches.length > 0) {
					e.preventDefault();
					const cmd = matches[slashHighlight];
					setInput(`/${cmd.name} `);
					return;
				}
			}
			if (e.key === "Escape") {
				e.preventDefault();
				// Suppress re-open for this exact input until the user edits it.
				suppressedFor.current = input;
				setSlashOpen(false);
				return;
			}
		}

		const action = resolveComposerKeyAction({
			key: e.key,
			shiftKey: e.shiftKey,
		});
		if (action === "clear") {
			e.preventDefault();
			clearInput();
			return;
		}
		if (action === "submit") {
			e.preventDefault();
			void submit(defaultIntent());
			return;
		}

		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		const result = navigateComposerHistory({
			key: e.key,
			input,
			history: messageHistory,
			activeIndex: historyIndex,
		});
		if (!result.handled) {
			if (result.activeIndex !== historyIndex)
				setHistoryIndex(result.activeIndex);
			return;
		}
		e.preventDefault();
		setInput(result.input);
		setHistoryIndex(result.activeIndex);
	}

	const hasText = input.trim().length > 0;

	return (
		<div className="flex flex-col gap-1">
			<SlashPopup
				open={slashOpen}
				matches={matches}
				highlight={slashHighlight}
				onHighlight={setSlashHighlight}
				onPick={runSlash}
			/>
			<form
				onSubmit={onFormSubmit}
				className="flex gap-2 rounded border border-divider surface-panel p-2"
			>
				<textarea
					rows={1}
					className="max-h-40 min-h-9 flex-1 resize-none bg-transparent text-[length:var(--font-size-composer)] text-primary placeholder-faint outline-none"
					placeholder={
						streaming ? "Steer or queue while streaming…" : "Type a message"
					}
					value={input}
					onChange={onInputChange}
					onKeyDown={onInputKeyDown}
				/>
				{streaming ? (
					<>
						<button
							type="button"
							onClick={() => void submit("steer")}
							className="rounded border border-amber-500 px-3 text-sm text-amber-200 hover:bg-amber-900/30 disabled:opacity-50"
							disabled={!hasText}
							title="Interrupt the agent and inject this message before its next step"
						>
							Steer
						</button>
						<button
							type="submit"
							className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
							disabled={!hasText}
							title="Queue this message to run after the current turn finishes"
						>
							Queue
						</button>
					</>
				) : (
					<button
						type="submit"
						className="rounded bg-indigo-600 px-3 text-sm text-white disabled:opacity-50"
						disabled={!hasText}
					>
						Send
					</button>
				)}
			</form>
		</div>
	);
}
