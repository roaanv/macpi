import { describe, expect, it } from "vitest";
import { resolveComposerKeyAction } from "../../src/renderer/utils/composer-keyboard";

describe("resolveComposerKeyAction", () => {
	it("submits on Enter without Shift", () => {
		expect(resolveComposerKeyAction({ key: "Enter", shiftKey: false })).toBe(
			"submit",
		);
	});

	it("allows newline on Shift+Enter", () => {
		expect(resolveComposerKeyAction({ key: "Enter", shiftKey: true })).toBe(
			"default",
		);
	});

	it("clears on Escape", () => {
		expect(resolveComposerKeyAction({ key: "Escape", shiftKey: false })).toBe(
			"clear",
		);
	});

	it("leaves other keys to default textarea behavior", () => {
		expect(resolveComposerKeyAction({ key: "a", shiftKey: false })).toBe(
			"default",
		);
	});
});
