import { describe, expect, it } from "vitest";
import { builtinCommands, match } from "../../src/renderer/slash/registry";
import type { SlashCommand } from "../../src/renderer/slash/types";

describe("builtinCommands", () => {
	it("returns the documented 7 built-ins", () => {
		const cmds = builtinCommands();
		const names = cmds.map((c) => c.name).sort();
		expect(names).toEqual([
			"clear",
			"compact",
			"copy",
			"help",
			"name",
			"new",
			"reload",
		]);
	});

	it("marks /compact and /reload as not-available during stream", () => {
		const cmds = builtinCommands();
		const compact = cmds.find((c) => c.name === "compact");
		const reload = cmds.find((c) => c.name === "reload");
		expect(compact?.availableDuringStream).toBe(false);
		expect(reload?.availableDuringStream).toBe(false);
	});

	it("marks the other 5 as available during stream", () => {
		const cmds = builtinCommands();
		for (const name of ["help", "clear", "copy", "new", "name"]) {
			expect(cmds.find((c) => c.name === name)?.availableDuringStream).toBe(
				true,
			);
		}
	});
});

describe("match", () => {
	const sample: SlashCommand[] = [
		{
			name: "help",
			description: "",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "clear",
			description: "",
			kind: "builtin",
			availableDuringStream: true,
		},
		{
			name: "compact",
			description: "",
			kind: "builtin",
			availableDuringStream: false,
		},
		{
			name: "copy",
			description: "",
			kind: "builtin",
			availableDuringStream: true,
		},
	];

	it("returns all input commands when query is empty, sorted alpha", () => {
		expect(match("", sample).map((c) => c.name)).toEqual([
			"clear",
			"compact",
			"copy",
			"help",
		]);
	});

	it("ranks exact-prefix matches before substring matches", () => {
		// "co" prefix-matches /compact and /copy; "co" doesn't appear inside any other name.
		// /compact and /copy both prefix-match; alpha order between them = compact, copy.
		expect(match("co", sample).map((c) => c.name)).toEqual(["compact", "copy"]);
	});

	it("matches case-insensitively", () => {
		expect(match("CO", sample).map((c) => c.name)).toEqual(["compact", "copy"]);
	});

	it("returns [] when nothing matches", () => {
		expect(match("xyz", sample)).toEqual([]);
	});
});
