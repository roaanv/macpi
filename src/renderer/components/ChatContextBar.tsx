// Second status row below ChatFooter — shows the nano-context-style
// segmented bar (what is filling the context window) plus a thin line of
// cumulative session usage (↑ in / ↓ out / R cache-read / W cache-write / $).
//
// Data comes from session.getContextBreakdown (computed server-side from
// AgentSession.state.messages + .systemPrompt + .getContextUsage()).
// Refreshes on turn_end / compaction_end events so it stays current without
// polling.

import {
	type ContextSegmentKey,
	formatTokens,
} from "../../shared/context-breakdown";
import { useInvalidateOnTurnEnd, useSessionContextBreakdown } from "../queries";

interface ChatContextBarProps {
	piSessionId: string | null;
}

// Same colours as nano-context (eyeballed to read against both light and
// dark surfaces; the bar is the only place we use these — surfaces around
// it pick up the active theme).
const SEGMENT_STYLE: Record<
	ContextSegmentKey,
	{ color: string; label: string; tooltipLabel: string }
> = {
	system: { color: "#82CA7A", label: "sys", tooltipLabel: "System prompt" },
	prompt: { color: "#E89BC1", label: "pr", tooltipLabel: "User prompts" },
	assistant: {
		color: "#8BC7C2",
		label: "ast",
		tooltipLabel: "Assistant replies + tool calls",
	},
	thinking: { color: "#73D0D2", label: "th", tooltipLabel: "Thinking blocks" },
	tools: { color: "#D8A657", label: "tl", tooltipLabel: "Tool results" },
};

const SEGMENT_ORDER: ContextSegmentKey[] = [
	"system",
	"prompt",
	"assistant",
	"thinking",
	"tools",
];

function Segment({
	kind,
	tokens,
	percent,
}: {
	kind: ContextSegmentKey;
	tokens: number;
	percent: number;
}) {
	if (tokens <= 0) return null;
	const { color, label, tooltipLabel } = SEGMENT_STYLE[kind];
	const sizeText = formatTokens(tokens);
	// Progressive disclosure: roomy segments show both label and size, narrow
	// ones drop the label, very narrow ones drop everything (still tooltip-able).
	let inlineText = "";
	if (percent >= 12) inlineText = `${label} ${sizeText}`;
	else if (percent >= 5) inlineText = sizeText;
	return (
		<div
			className="flex h-3.5 min-w-0 items-center justify-center overflow-hidden whitespace-nowrap text-[9px] font-medium leading-none tabular-nums"
			style={{
				flexGrow: tokens,
				flexBasis: 0,
				background: color,
				color: "#15181d",
			}}
			title={`${tooltipLabel}: ${sizeText} tokens (${percent.toFixed(1)}%)`}
		>
			{inlineText}
		</div>
	);
}

/**
 * Replace a leading home-dir match with `~`. Handles the exact-home case
 * (`/Users/x` → `~`), a child path (`/Users/x/code` → `~/code`), and anything
 * outside home (returned unchanged). Cross-platform: works for any homeDir
 * the main process supplies, not just `/Users/...`.
 */
function abbreviateHome(cwd: string | null, homeDir: string): string {
	if (!cwd) return "";
	if (!homeDir) return cwd;
	if (cwd === homeDir) return "~";
	if (cwd.startsWith(`${homeDir}/`)) return `~${cwd.slice(homeDir.length)}`;
	return cwd;
}

function FreeSegment({ tokens, percent }: { tokens: number; percent: number }) {
	if (tokens <= 0) return null;
	const sizeText = formatTokens(tokens);
	let inlineText = "";
	if (percent >= 12) inlineText = `free ${sizeText}`;
	else if (percent >= 5) inlineText = sizeText;
	return (
		<div
			className="flex h-3.5 min-w-0 items-center justify-center overflow-hidden whitespace-nowrap text-[9px] font-medium leading-none tabular-nums"
			style={{
				flexGrow: tokens,
				flexBasis: 0,
				background: "var(--row-bg)",
				color: "var(--text-muted)",
			}}
			title={`Free: ${sizeText} tokens (${percent.toFixed(1)}%)`}
		>
			{inlineText}
		</div>
	);
}

export function ChatContextBar({ piSessionId }: ChatContextBarProps) {
	const breakdown = useSessionContextBreakdown(piSessionId);
	useInvalidateOnTurnEnd(piSessionId, [
		"session.contextBreakdown",
		piSessionId,
	]);

	if (!piSessionId || !breakdown.data) return null;
	const d = breakdown.data;
	if (d.contextWindow <= 0) return null;

	const pct = (n: number) => (n / d.contextWindow) * 100;
	const usedPct = (d.usedTokens / d.contextWindow) * 100;
	const prefix = d.usageIsEstimated ? "~" : "";
	const contextSummary = `${prefix}${formatTokens(d.usedTokens)} / ${formatTokens(d.contextWindow)} (${prefix}${usedPct.toFixed(1)}%)`;

	const u = d.cumulativeUsage;
	const cumulativeParts = [
		u.input > 0 ? `↑${formatTokens(u.input)}` : "",
		u.output > 0 ? `↓${formatTokens(u.output)}` : "",
		u.cacheRead > 0 ? `R${formatTokens(u.cacheRead)}` : "",
		u.cacheWrite > 0 ? `W${formatTokens(u.cacheWrite)}` : "",
		u.cost > 0 ? `$${u.cost.toFixed(3)}` : "",
	].filter(Boolean);

	const displayCwd = abbreviateHome(d.cwd, d.homeDir);

	return (
		<div className="mt-1.5 flex flex-col gap-1">
			<div
				className="flex w-full overflow-hidden rounded border border-divider"
				style={{ height: 14 }}
			>
				{SEGMENT_ORDER.map((key) => (
					<Segment
						key={key}
						kind={key}
						tokens={d.segments[key]}
						percent={pct(d.segments[key])}
					/>
				))}
				<FreeSegment tokens={d.freeTokens} percent={pct(d.freeTokens)} />
			</div>
			<div className="flex flex-wrap items-center gap-x-3 text-[10px] text-faint">
				<span className="font-medium tabular-nums text-muted">
					{contextSummary}
				</span>
				{cumulativeParts.length > 0 && (
					<>
						<span aria-hidden>·</span>
						<span
							className="font-medium tabular-nums"
							title="Cumulative tokens this session — ↑ input · ↓ output · R cache read · W cache write · $ cost"
						>
							{cumulativeParts.join(" ")}
						</span>
					</>
				)}
				{displayCwd && (
					<>
						<span aria-hidden>·</span>
						<span className="truncate" title={d.cwd ?? undefined}>
							{displayCwd}
						</span>
					</>
				)}
				{d.sessionLabel && (
					<>
						<span aria-hidden>·</span>
						<span className="truncate text-muted">{d.sessionLabel}</span>
					</>
				)}
			</div>
		</div>
	);
}
