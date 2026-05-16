// Bottom half of the file browser pane. Renders the currently-selected
// file. Three branches:
//   1. sizeBytes > 1MB → short-circuit before the IPC call. (Backend
//      enforces the same cap, but we save a round-trip and let the user
//      know without thrashing the network.)
//   2. Markdown extension → MarkdownText (the same renderer chat uses,
//      so links route through shell.openExternal, scripts can't escape).
//   3. Anything else → <pre> with the monospace font token.
//
// Errors surface inline. They clear automatically when the user selects
// a different file, because that changes the query key.

import { isMarkdownPath } from "../../shared/text-files";
import { useFileContent } from "../queries";
import { MarkdownText } from "./messages/MarkdownText";

const MAX_BYTES = 1_048_576;

export function FilePreview({
	piSessionId,
	selectedPath,
	sizeBytes,
}: {
	piSessionId: string | null;
	selectedPath: string | null;
	sizeBytes: number;
}) {
	const overCap = sizeBytes > MAX_BYTES;
	const query = useFileContent(piSessionId, overCap ? null : selectedPath);

	if (!selectedPath) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
				Select a file to preview.
			</div>
		);
	}
	if (overCap) {
		return (
			<div className="px-3 py-2 text-sm text-muted">
				File too large to preview ({sizeBytes.toLocaleString()} bytes; cap{" "}
				{MAX_BYTES.toLocaleString()}).
			</div>
		);
	}
	if (query.isLoading) {
		return <div className="px-3 py-2 text-sm text-muted">Loading…</div>;
	}
	if (query.isError) {
		const msg =
			query.error instanceof Error ? query.error.message : String(query.error);
		return <div className="px-3 py-2 text-sm text-red-300">Error: {msg}</div>;
	}
	const content = query.data?.content ?? "";

	if (isMarkdownPath(selectedPath)) {
		// h-full is load-bearing: without it the wrapper sizes to content and
		// the file pane's overflow-hidden parent clips tall markdown before
		// our overflow-auto can install a scrollbar. Matches the <pre> branch.
		return (
			<div className="h-full overflow-y-auto px-3 py-2">
				<MarkdownText text={content} />
			</div>
		);
	}
	return (
		<pre
			className="h-full overflow-auto px-3 py-2 text-xs"
			style={{
				fontFamily: "var(--font-mono)",
				tabSize: 4,
			}}
		>
			{content}
		</pre>
	);
}
