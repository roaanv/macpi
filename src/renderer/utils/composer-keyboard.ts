export type ComposerKeyAction = "submit" | "clear" | "default";

export interface ComposerKeyInput {
	key: string;
	shiftKey: boolean;
}

export function resolveComposerKeyAction({
	key,
	shiftKey,
}: ComposerKeyInput): ComposerKeyAction {
	if (key === "Escape") return "clear";
	if (key === "Enter" && !shiftKey) return "submit";
	return "default";
}
