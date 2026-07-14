// Renders a tool-call entry in the chat timeline with a collapsed one-line
// summary and an expanded view showing args (and result/error). Border color
// reflects the tool's current state (pending/ok/error). The collapsed line
// shows a per-tool one-line summary; the expanded result section truncates
// long string output and bash stdout/stderr blobs via truncateOutput().

import React from "react";
import type { ToolCallEntry } from "../../../shared/timeline-types";
import { truncateOutput } from "../../utils/truncate-output";
import { type DiffLine, unifiedDiffLines } from "../../utils/unified-diff";

const BORDERS: Record<ToolCallEntry["state"], string> = {
	pending: "border-accent",
	ok: "border-ok",
	error: "border-err",
};

function clip(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function summarize(toolName: string, args: unknown): string {
	const a = (args ?? {}) as Record<string, unknown>;
	switch (toolName) {
		case "bash":
			return clip(String(a.command ?? ""), 80);
		case "read":
			return [
				a.path,
				a.startLine ? `lines ${a.startLine}-${a.endLine ?? a.startLine}` : null,
			]
				.filter(Boolean)
				.join(" · ");
		case "grep":
			return `${String(a.pattern ?? "")} in ${String(a.path ?? ".")}`;
		case "find":
			return String(a.pattern ?? "");
		case "ls":
			return String(a.path ?? ".");
		case "edit":
		case "write":
			return String(a.path ?? "");
		default:
			return "";
	}
}

export function ToolBlock({ entry }: { entry: ToolCallEntry }) {
	const [open, setOpen] = React.useState(false);

	return (
		<div
			className={`rounded border-l-2 ${BORDERS[entry.state]} surface-row px-2 py-1 type-code text-primary`}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-2 text-left"
			>
				<span>{open ? "▾" : "▸"}</span>
				<span className="text-muted">🔧 {entry.toolName}:</span>
				<span className="text-primary truncate">
					{summarize(entry.toolName, entry.args)}
				</span>
				<span className="ml-auto text-muted">
					{entry.state === "pending" && "running…"}
					{entry.state === "ok" && "✓"}
					{entry.state === "error" && "✘"}
				</span>
			</button>
			{open && (
				<div className="mt-2 space-y-2">
					{(() => {
						const diff = diffFromArgs(entry.toolName, entry.args);
						if (diff) {
							return (
								<DetailSection label="diff">
									<DiffView lines={diff} />
								</DetailSection>
							);
						}
						return (
							<DetailSection label="args">
								<pre className="whitespace-pre-wrap type-technical-wrap text-muted">
									{JSON.stringify(entry.args, null, 2)}
								</pre>
							</DetailSection>
						);
					})()}
					{entry.state !== "pending" && (
						<DetailSection label={entry.state === "ok" ? "result" : "error"}>
							<pre
								className={`whitespace-pre-wrap type-technical-wrap ${entry.state === "error" ? "text-err" : "text-primary"}`}
							>
								{(() => {
									if (typeof entry.result === "string") {
										return truncateOutput(entry.result).text;
									}
									if (
										entry.result &&
										typeof entry.result === "object" &&
										"stdout" in entry.result
									) {
										// bash result shape: { stdout, stderr, exitCode, durationMs }
										const r = entry.result as {
											stdout?: string;
											stderr?: string;
											exitCode?: number;
										};
										const stdout = r.stdout
											? truncateOutput(r.stdout).text
											: "";
										const stderr = r.stderr
											? `\n--stderr--\n${truncateOutput(r.stderr).text}`
											: "";
										return `${stdout}${stderr}\n--exit ${r.exitCode ?? "?"}--`;
									}
									return JSON.stringify(entry.result, null, 2);
								})()}
							</pre>
						</DetailSection>
					)}
				</div>
			)}
		</div>
	);
}

function DetailSection({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="type-overline">{label}</div>
			<div className="mt-0.5">{children}</div>
		</div>
	);
}

function diffFromArgs(toolName: string, args: unknown): DiffLine[] | null {
	const a = (args ?? {}) as Record<string, unknown>;
	if (
		toolName === "edit" &&
		typeof a.oldText === "string" &&
		typeof a.newText === "string"
	) {
		return unifiedDiffLines(a.oldText, a.newText);
	}
	if (toolName === "write" && typeof a.content === "string") {
		return unifiedDiffLines("", a.content);
	}
	return null;
}

function DiffView({ lines }: { lines: DiffLine[] }) {
	return (
		<div className="overflow-x-auto rounded surface-row p-2 type-code">
			{lines.map((line, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
					key={i}
					className={
						line.kind === "add"
							? "surface-ok-soft text-ok"
							: line.kind === "remove"
								? "surface-err-soft text-err"
								: "text-muted"
					}
				>
					<span className="mr-2 text-muted">
						{line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " "}
					</span>
					{line.text || " "}
				</div>
			))}
		</div>
	);
}
