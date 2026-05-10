// Pure helpers for rendering and computing session labels.

export interface LabelInputs {
	piSessionId: string;
	cwd: string | null;
	label: string | null;
}

export function computeSessionLabel(input: LabelInputs): string {
	if (input.label) return input.label;
	const fromCwd = basename(input.cwd);
	if (fromCwd) return fromCwd;
	return input.piSessionId.slice(0, 8) || "(unlabeled)";
}

export function formatFirstMessageLabel(
	basename: string,
	text: string,
): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	const max = 40;
	const truncated =
		cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
	const head = basename.length > 0 ? basename : "(unlabeled)";
	return `${head}: ${truncated}`;
}

function basename(p: string | null): string | null {
	if (!p) return null;
	const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
	const idx = trimmed.lastIndexOf("/");
	if (idx === -1) return trimmed || null;
	return trimmed.slice(idx + 1) || null;
}
