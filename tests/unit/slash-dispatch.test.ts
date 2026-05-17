import { describe, expect, it, vi } from "vitest";
import { dispatch } from "../../src/renderer/slash/dispatch";
import type {
	SlashCommand,
	SlashDispatchCtx,
} from "../../src/renderer/slash/types";

function makeCtx(overrides: Partial<SlashDispatchCtx> = {}): SlashDispatchCtx {
	return {
		streaming: false,
		piSessionId: "sid",
		channelId: "ch",
		lastAssistantText: () => "hello world",
		openHelpDialog: vi.fn(),
		showToast: vi.fn(),
		clearComposerInput: vi.fn(),
		onSessionCreated: vi.fn(),
		...overrides,
	};
}

const builtin = (name: string, available = true): SlashCommand => ({
	name,
	description: "",
	kind: "builtin",
	availableDuringStream: available,
});

describe("dispatch", () => {
	it("returns block when streaming and command is not stream-available", () => {
		const ctx = makeCtx({ streaming: true });
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: [] },
			ctx,
		);
		expect(action).toMatchObject({ kind: "block" });
	});

	it("/help → run effect that calls openHelpDialog", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("help"), { name: "help", args: [] }, ctx);
		expect(action?.kind).toBe("run");
		if (action?.kind === "run") await action.effect();
		expect(ctx.openHelpDialog).toHaveBeenCalled();
	});

	it("/clear → run effect that calls clearComposerInput", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("clear"), { name: "clear", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.clearComposerInput).toHaveBeenCalled();
	});

	it("/copy with last assistant text → toast 'Copied'", async () => {
		const ctx = makeCtx();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(globalThis, "navigator", {
			value: { clipboard: { writeText } },
			configurable: true,
		});
		const action = dispatch(builtin("copy"), { name: "copy", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(writeText).toHaveBeenCalledWith("hello world");
		expect(ctx.showToast).toHaveBeenCalledWith("Copied");
	});

	it("/copy with no assistant text → toast 'Nothing to copy'", async () => {
		const ctx = makeCtx({ lastAssistantText: () => null });
		const action = dispatch(builtin("copy"), { name: "copy", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.showToast).toHaveBeenCalledWith("Nothing to copy");
	});

	it("/compact (no args) idle → ipc session.compact with no prompt", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: [] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.compact",
			args: { piSessionId: "sid", prompt: undefined },
		});
	});

	it("/compact 'force it' idle → ipc with prompt joined", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("compact", false),
			{ name: "compact", args: ["force", "it"] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.compact",
			args: { piSessionId: "sid", prompt: "force it" },
		});
	});

	it("/name with args → ipc session.rename", () => {
		const ctx = makeCtx();
		const action = dispatch(
			builtin("name"),
			{ name: "name", args: ["my", "session"] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.rename",
			args: { piSessionId: "sid", label: "my session" },
		});
	});

	it("/name with no args → run effect toasting usage", async () => {
		const ctx = makeCtx();
		const action = dispatch(builtin("name"), { name: "name", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.showToast).toHaveBeenCalledWith("Usage: /name <text>");
	});

	it("skill command → returns null (passthrough)", () => {
		const skill: SlashCommand = {
			name: "skill:fmt",
			description: "",
			kind: "skill",
			availableDuringStream: true,
		};
		const action = dispatch(skill, { name: "skill:fmt", args: [] }, makeCtx());
		expect(action).toBeNull();
	});

	it("/new with channelId → ipc session.create with the channel + first arg as cwd", () => {
		const ctx = makeCtx({ channelId: "ch-7" });
		const action = dispatch(
			builtin("new"),
			{ name: "new", args: ["/tmp/foo"] },
			ctx,
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.create",
			args: { channelId: "ch-7", cwd: "/tmp/foo" },
		});
	});

	it("/new with no channelId → run effect toasting 'No active channel'", async () => {
		const ctx = makeCtx({ channelId: null });
		const action = dispatch(builtin("new"), { name: "new", args: [] }, ctx);
		if (action?.kind === "run") await action.effect();
		expect(ctx.showToast).toHaveBeenCalledWith("No active channel");
	});

	it("/reload idle → ipc session.reload", () => {
		const action = dispatch(
			builtin("reload", false),
			{ name: "reload", args: [] },
			makeCtx(),
		);
		expect(action).toEqual({
			kind: "ipc",
			method: "session.reload",
			args: { piSessionId: "sid" },
		});
	});
});
