// Status footer below the composer. Shows three pills derived from the live
// AgentSession state: current model, current thinking level, and context
// percent used / max. Stays in sync via the session.footerStats query which
// is invalidated whenever a turn ends.

import { useQueryClient } from "@tanstack/react-query";
import React from "react";
import { onPiEvent } from "../ipc";
import { useSessionFooterStats } from "../queries";

type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| string;

interface ChatFooterProps {
	piSessionId: string | null;
}

const THINKING_LABELS: Record<string, string> = {
	off: "off",
	minimal: "min",
	low: "low",
	medium: "med",
	high: "high",
	xhigh: "xhigh",
};

function formatTokens(n: number): string {
	if (n < 1000) return n.toString();
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function stripClaudePrefix(name: string): string {
	return name.startsWith("Claude ") ? name.slice(7) : name;
}

function contextPillTone(percent: number | null): string {
	if (percent === null) return "text-muted";
	if (percent >= 90) return "text-red-400";
	if (percent >= 75) return "text-amber-300";
	return "text-muted";
}

function thinkingPillTone(level: ThinkingLevel): string {
	if (level === "high" || level === "xhigh") return "text-accent";
	if (level === "off") return "text-faint";
	return "text-muted";
}

export function ChatFooter({ piSessionId }: ChatFooterProps) {
	const stats = useSessionFooterStats(piSessionId);
	const qc = useQueryClient();

	// Refresh after each turn so context % jumps once the model reports usage.
	React.useEffect(() => {
		if (!piSessionId) return;
		const off = onPiEvent((raw) => {
			if (!raw || typeof raw !== "object") return;
			const ev = raw as { type?: unknown; piSessionId?: unknown };
			if (ev.piSessionId !== piSessionId) return;
			if (
				ev.type === "session.turn_end" ||
				ev.type === "session.compaction_end"
			) {
				qc.invalidateQueries({
					queryKey: ["session.footerStats", piSessionId],
				});
			}
		});
		return off;
	}, [piSessionId, qc]);

	if (!piSessionId || !stats.data) return null;

	const { model, thinkingLevel, contextUsage } = stats.data;
	const modelName = model
		? stripClaudePrefix(model.name || model.id)
		: "no model";
	const thinkLabel = THINKING_LABELS[thinkingLevel] ?? thinkingLevel;

	let contextDisplay: string;
	if (contextUsage && contextUsage.percent !== null) {
		const pct = Math.round(contextUsage.percent);
		const used =
			contextUsage.tokens !== null ? formatTokens(contextUsage.tokens) : "?";
		const total = formatTokens(contextUsage.contextWindow);
		contextDisplay = `${pct}% (${used}/${total})`;
	} else if (model?.contextWindow) {
		contextDisplay = `0% (0/${formatTokens(model.contextWindow)})`;
	} else {
		contextDisplay = "—";
	}

	return (
		<div
			className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-divider border-t pt-1.5 text-[11px] text-muted"
			role="status"
			aria-label="Session footer"
		>
			<span className="inline-flex items-center gap-1" title={model?.id}>
				<span aria-hidden className="text-faint">
					◆
				</span>
				<span className="font-medium text-primary">{modelName}</span>
			</span>
			<span aria-hidden className="text-faint">
				·
			</span>
			<span
				className={`inline-flex items-center gap-1 ${thinkingPillTone(thinkingLevel)}`}
				title="Thinking level"
			>
				<span aria-hidden>think:</span>
				<span className="font-medium">{thinkLabel}</span>
			</span>
			<span aria-hidden className="text-faint">
				·
			</span>
			<span
				className={`inline-flex items-center gap-1 ${contextPillTone(contextUsage?.percent ?? null)}`}
				title={
					contextUsage
						? `${contextUsage.tokens ?? 0} tokens of ${contextUsage.contextWindow} context window`
						: "context usage unknown"
				}
			>
				<span aria-hidden>ctx</span>
				<span className="font-medium">{contextDisplay}</span>
			</span>
		</div>
	);
}
