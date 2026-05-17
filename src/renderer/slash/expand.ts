// Interpolates pi-style prompt-template variables. The grammar matches
// pi-coding-agent's prompt-templates spec:
//   $1, $2, …       positional args (1-indexed)
//   $@ or $ARGUMENTS  all args, space-joined
//   ${@:N}          args from N to end, space-joined
//   ${@:N:L}        L args starting at N, space-joined
// Unknown identifiers (e.g. "$foo") are left literal.

export function expand(body: string, args: string[]): string {
	// Order matters: ${@:N:L} first (most specific), then ${@:N}, then
	// $@/$ARGUMENTS, then $N. Otherwise $@ would shadow ${@:N}.
	let out = body;

	out = out.replace(/\$\{@:(\d+):(\d+)\}/g, (_, nStr, lStr) => {
		const n = Number.parseInt(nStr, 10);
		const l = Number.parseInt(lStr, 10);
		// 1-indexed N; slice is 0-indexed.
		return args.slice(n - 1, n - 1 + l).join(" ");
	});
	out = out.replace(/\$\{@:(\d+)\}/g, (_, nStr) => {
		const n = Number.parseInt(nStr, 10);
		return args.slice(n - 1).join(" ");
	});
	out = out.replace(/\$ARGUMENTS\b/g, () => args.join(" "));
	out = out.replace(/\$@/g, () => args.join(" "));
	// $0 is not a positional arg in pi's grammar — leave literal.
	out = out.replace(/\$([1-9]\d*)/g, (_, nStr) => {
		const n = Number.parseInt(nStr, 10);
		return args[n - 1] ?? "";
	});

	return out;
}
