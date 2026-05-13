// Renders assistant text as markdown. Safety properties:
//   - react-markdown never renders raw HTML (no rehype-raw, no
//     dangerouslySetInnerHTML), so `<script>` tags etc. are escaped to
//     literal text rather than executed.
//   - urlTransform restricts <a href> + <img src> schemes to an
//     allowlist (http/https/mailto). javascript:, data:, file:, etc.
//     are stripped.
//   - All links carry target="_blank" + rel="noopener noreferrer". The
//     main process's setWindowOpenHandler intercepts the open and routes
//     it through shell.openExternal, so the renderer can never navigate
//     away from the app.
//
// GFM plugin adds GitHub-flavored extensions (tables, strikethrough,
// task lists, autolinks) — pi/Claude/Codex routinely emit these.
//
// The component is tolerant of partial markdown (mid-stream): an
// unclosed code fence renders as a code block in progress, an unclosed
// `**bold**` renders as literal asterisks. react-markdown / remark
// handle malformed input without throwing.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"] as const;

function safeUrl(url: string): string {
	try {
		// Relative URLs (no scheme) are allowed; URL parsing throws on them
		// so the early return below catches that path.
		const parsed = new URL(url);
		if (
			ALLOWED_SCHEMES.includes(
				parsed.protocol as (typeof ALLOWED_SCHEMES)[number],
			)
		) {
			return url;
		}
		return "";
	} catch {
		// Treat as relative; render as-is (no scheme to abuse).
		return url;
	}
}

interface MarkdownTextProps {
	text: string;
}

export function MarkdownText({ text }: MarkdownTextProps) {
	return (
		<div className="macpi-markdown">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				urlTransform={safeUrl}
				components={{
					a: ({ children, href, ...rest }) => (
						<a
							{...rest}
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							className="underline decoration-dotted underline-offset-2"
							style={{ color: "var(--accent)" }}
						>
							{children}
						</a>
					),
					// Inline code (single backticks) vs fenced code blocks. The
					// `<pre>` wrapper differentiates them: react-markdown wraps
					// fenced blocks in <pre><code>; inline backticks produce a
					// bare <code>.
					code: ({ children, className, ...rest }) => (
						<code
							{...rest}
							className={className}
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "var(--font-size-code-block)",
							}}
						>
							{children}
						</code>
					),
					pre: ({ children, ...rest }) => (
						<pre
							{...rest}
							className="my-2 overflow-x-auto rounded p-2 surface-row"
							style={{
								fontFamily: "var(--font-mono)",
								fontSize: "var(--font-size-code-block)",
							}}
						>
							{children}
						</pre>
					),
				}}
			>
				{text}
			</ReactMarkdown>
		</div>
	);
}

export { safeUrl as __safeUrlForTesting };
