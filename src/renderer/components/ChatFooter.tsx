// Status footer below the composer. Shows three pills derived from the live
// AgentSession state: current model, current thinking level, and context
// percent used / max. Stays in sync via the session.footerStats query which
// is invalidated whenever a turn ends.

import { formatTokens } from "../../shared/context-breakdown";
import type { ThinkingLevel } from "../../shared/ipc-types";
import { useInvalidateOnTurnEnd, useSessionFooterStats } from "../queries";

interface ChatFooterProps {
	piSessionId: string | null;
}

const THINKING_LABELS: Record<ThinkingLevel, string> = {
	off: "off",
	minimal: "min",
	low: "low",
	medium: "med",
	high: "high",
	xhigh: "xhigh",
};

function stripClaudePrefix(name: string): string {
	return name.startsWith("Claude ") ? name.slice(7) : name;
}

/**
 * Pick a CSS color var based on context usage. Theme variables stay in the
 * theme system so dark/light always have legible severities (`text-red-400`
 * etc. don't track the theme).
 */
function contextPillVar(percent: number | null): string | undefined {
	if (percent === null) return undefined;
	if (percent >= 90) return "var(--err)";
	if (percent >= 75) return "var(--warn)";
	return undefined;
}

function thinkingPillTone(level: ThinkingLevel): string {
	if (level === "high" || level === "xhigh") return "text-accent";
	if (level === "off") return "text-faint";
	return "text-muted";
}

export function ChatFooter({ piSessionId }: ChatFooterProps) {
	const stats = useSessionFooterStats(piSessionId);
	useInvalidateOnTurnEnd(piSessionId, ["session.footerStats", piSessionId]);

	if (!piSessionId || !stats.data) return null;

	const { model, thinkingLevel, contextUsage } = stats.data;
	const modelName = model
		? stripClaudePrefix(model.name || model.id)
		: "no model";
	const thinkLabel = THINKING_LABELS[thinkingLevel];

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

	const contextColor = contextPillVar(contextUsage?.percent ?? null);

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
				className="inline-flex items-center gap-1"
				style={contextColor ? { color: contextColor } : undefined}
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
