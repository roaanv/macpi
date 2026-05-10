// Bash output truncation: keep the first FIRST and last LAST lines if total > MAX.
// Returns the original string when no truncation needed.

export interface TruncatedOutput {
	text: string;
	truncated: boolean;
	totalLines: number;
}

const FIRST = 100;
const LAST = 100;
const MAX = 200;

export function truncateOutput(input: string): TruncatedOutput {
	const lines = input.split(/\r?\n/);
	if (lines.length <= MAX) {
		return { text: input, truncated: false, totalLines: lines.length };
	}
	const head = lines.slice(0, FIRST).join("\n");
	const tail = lines.slice(-LAST).join("\n");
	const omitted = lines.length - FIRST - LAST;
	return {
		text: `${head}\n…[${omitted} lines truncated]…\n${tail}`,
		truncated: true,
		totalLines: lines.length,
	};
}
