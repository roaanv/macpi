import { describe, expect, it } from "vitest";
import { navigateComposerHistory } from "../../src/renderer/utils/composer-history";

describe("navigateComposerHistory", () => {
	const history = ["first", "second", "third"];

	it("recalls the newest message on ArrowUp when the composer is empty", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowUp",
				input: "",
				history,
				activeIndex: null,
			}),
		).toEqual({ handled: true, input: "third", activeIndex: 2 });
	});

	it("does not intercept ArrowUp when the composer has typed text", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowUp",
				input: "draft",
				history,
				activeIndex: null,
			}),
		).toEqual({ handled: false, input: "draft", activeIndex: null });
	});

	it("moves older with ArrowUp while browsing unedited history", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowUp",
				input: "third",
				history,
				activeIndex: 2,
			}),
		).toEqual({ handled: true, input: "second", activeIndex: 1 });
	});

	it("moves newer with ArrowDown while browsing unedited history", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowDown",
				input: "second",
				history,
				activeIndex: 1,
			}),
		).toEqual({ handled: true, input: "third", activeIndex: 2 });
	});

	it("clears the composer when ArrowDown moves past the newest history item", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowDown",
				input: "third",
				history,
				activeIndex: 2,
			}),
		).toEqual({ handled: true, input: "", activeIndex: null });
	});

	it("does not intercept arrows after the recalled text has been edited", () => {
		expect(
			navigateComposerHistory({
				key: "ArrowDown",
				input: "third edited",
				history,
				activeIndex: 2,
			}),
		).toEqual({ handled: false, input: "third edited", activeIndex: null });
	});
});
