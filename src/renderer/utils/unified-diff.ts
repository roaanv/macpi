// Minimal LCS-based unified-diff line renderer. Used to render edit/write
// tool results inline in the chat. Not intended for general purpose use.

export type DiffKind = "equal" | "add" | "remove";

export interface DiffLine {
	kind: DiffKind;
	text: string;
}

export function unifiedDiffLines(oldText: string, newText: string): DiffLine[] {
	const oldLines = oldText.length > 0 ? oldText.split(/\r?\n/) : [];
	const newLines = newText.length > 0 ? newText.split(/\r?\n/) : [];

	const lcs = computeLcs(oldLines, newLines);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	for (const m of lcs) {
		while (i < m.aIndex) out.push({ kind: "remove", text: oldLines[i++] });
		while (j < m.bIndex) out.push({ kind: "add", text: newLines[j++] });
		out.push({ kind: "equal", text: oldLines[i] });
		i++;
		j++;
	}
	while (i < oldLines.length) out.push({ kind: "remove", text: oldLines[i++] });
	while (j < newLines.length) out.push({ kind: "add", text: newLines[j++] });
	return out;
}

interface Match {
	aIndex: number;
	bIndex: number;
}

/** Standard LCS-via-DP, returning the matching indices in order. */
function computeLcs(a: string[], b: string[]): Match[] {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		Array(n + 1).fill(0),
	);
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			dp[i][j] =
				a[i] === b[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const matches: Match[] = [];
	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (a[i] === b[j]) {
			matches.push({ aIndex: i, bIndex: j });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			i++;
		} else {
			j++;
		}
	}
	return matches;
}
