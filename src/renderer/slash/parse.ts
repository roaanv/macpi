// Tokenises composer input into a slash command + args. Returns null if
// the input isn't a slash trigger (doesn't start with "/" or has a
// newline before the first arg-separator space — the first-line-only
// rule from the spec).

import type { ParsedSlash } from "./types";

export function parse(input: string): ParsedSlash | null {
	if (!input.startsWith("/")) return null;

	// Find first space (= name/args separator) and first newline.
	const firstSpace = indexOfWhitespace(input);
	const firstNewline = input.indexOf("\n");
	// If a newline appears before the first space (or there's no space at
	// all but there's a newline), the trigger isn't on line 1.
	if (firstNewline !== -1 && (firstSpace === -1 || firstNewline < firstSpace)) {
		return null;
	}

	const name = (
		firstSpace === -1 ? input.slice(1) : input.slice(1, firstSpace)
	).trim();
	const rest = firstSpace === -1 ? "" : input.slice(firstSpace + 1);
	const args = tokeniseArgs(rest);
	return { name, args };
}

/** Index of the first whitespace character (space, tab) — NOT newline. */
function indexOfWhitespace(s: string): number {
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === " " || c === "\t") return i;
	}
	return -1;
}

function tokeniseArgs(rest: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < rest.length) {
		// Skip whitespace.
		while (i < rest.length && /\s/.test(rest[i])) i++;
		if (i >= rest.length) break;
		// Quoted span.
		if (rest[i] === '"') {
			i++;
			let buf = "";
			while (i < rest.length && rest[i] !== '"') {
				buf += rest[i];
				i++;
			}
			if (i < rest.length) i++; // skip closing quote
			out.push(buf);
			continue;
		}
		// Bare token.
		let buf = "";
		while (i < rest.length && !/\s/.test(rest[i])) {
			buf += rest[i];
			i++;
		}
		if (buf.length > 0) out.push(buf);
	}
	return out;
}
