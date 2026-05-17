// Built-in command catalogue + match function. Both are pure so the
// Composer can rebuild matches on every render without caching.

import type { SlashCommand } from "./types";

export function builtinCommands(): SlashCommand[] {
	return [
		{
			name: "help",
			description: "Show all available slash commands",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "clear",
			description: "Clear the composer text",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "copy",
			description: "Copy the last assistant message to the clipboard",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "new",
			description: "Start a new session in this channel",
			argumentHint: "[cwd]",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "name",
			description: "Rename the current session",
			argumentHint: "<text>",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "compact",
			description: "Compact the conversation history",
			argumentHint: "[prompt]",
			kind: "builtin",
			availableDuringStream: false,
		},
		{
			name: "reload",
			description: "Reload skills, extensions, prompts for this session",
			kind: "builtin",
			availableDuringStream: false,
		},
	];
}

export function match(query: string, commands: SlashCommand[]): SlashCommand[] {
	const q = query.toLowerCase();
	if (q === "") {
		return [...commands].sort((a, b) => a.name.localeCompare(b.name));
	}

	const prefix: SlashCommand[] = [];
	const substring: SlashCommand[] = [];
	for (const cmd of commands) {
		const n = cmd.name.toLowerCase();
		if (n.startsWith(q)) prefix.push(cmd);
		else if (n.includes(q)) substring.push(cmd);
	}
	prefix.sort((a, b) => a.name.localeCompare(b.name));
	substring.sort((a, b) => a.name.localeCompare(b.name));
	return [...prefix, ...substring];
}
