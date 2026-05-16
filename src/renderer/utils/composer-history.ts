export type ComposerHistoryKey = "ArrowUp" | "ArrowDown";

export interface ComposerHistoryState {
	key: ComposerHistoryKey;
	input: string;
	history: readonly string[];
	activeIndex: number | null;
}

export interface ComposerHistoryResult {
	handled: boolean;
	input: string;
	activeIndex: number | null;
}

export function navigateComposerHistory({
	key,
	input,
	history,
	activeIndex,
}: ComposerHistoryState): ComposerHistoryResult {
	if (history.length === 0) return { handled: false, input, activeIndex: null };

	if (activeIndex !== null && history[activeIndex] !== input) {
		return { handled: false, input, activeIndex: null };
	}

	if (key === "ArrowUp") {
		if (activeIndex === null) {
			if (input.length > 0) return { handled: false, input, activeIndex: null };
			const nextIndex = history.length - 1;
			return { handled: true, input: history[nextIndex], activeIndex: nextIndex };
		}

		const nextIndex = Math.max(0, activeIndex - 1);
		return { handled: true, input: history[nextIndex], activeIndex: nextIndex };
	}

	if (activeIndex === null) return { handled: false, input, activeIndex: null };

	const nextIndex = activeIndex + 1;
	if (nextIndex >= history.length) {
		return { handled: true, input: "", activeIndex: null };
	}
	return { handled: true, input: history[nextIndex], activeIndex: nextIndex };
}
