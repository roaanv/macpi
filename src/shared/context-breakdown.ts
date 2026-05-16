// Pure helpers that derive a "what's filling the context window" breakdown
// from an AgentSession's messages + system prompt. Inspired by
// daynin/nano-context's segmentation, ported to run server-side and shipped
// to the renderer over IPC.
//
// Estimation rules mirror nano-context so users can compare numbers across
// the two extensions:
//   - text → ceil(length / 4) tokens
//   - image → 1200 tokens
//   - tool-call → ceil((name + JSON.stringify(args)) / 4) tokens
// Once the model reports a real `tokens` value (via AgentSession.getContextUsage),
// the per-segment estimates are scaled proportionally so the bar matches the
// authoritative used-tokens count.

export const CHARACTERS_PER_TOKEN = 4;
export const IMAGE_TOKEN_ESTIMATE = 1200;

export type ContextSegmentKey =
	| "system"
	| "prompt"
	| "assistant"
	| "thinking"
	| "tools";

export const SEGMENT_KEYS: readonly ContextSegmentKey[] = [
	"system",
	"prompt",
	"assistant",
	"thinking",
	"tools",
];

export type ContextSegments = Readonly<Record<ContextSegmentKey, number>>;

export interface ContextBreakdown {
	segments: ContextSegments;
	usedTokens: number;
	contextWindow: number;
	freeTokens: number;
	/** True when usedTokens was estimated rather than reported by the model. */
	usageIsEstimated: boolean;
}

export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
}

const emptySegments = (): Record<ContextSegmentKey, number> => ({
	system: 0,
	prompt: 0,
	assistant: 0,
	thinking: 0,
	tools: 0,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object";

const contentParts = (content: unknown): Record<string, unknown>[] =>
	Array.isArray(content) ? content.filter(isRecord) : [];

const estimateTextTokens = (text: string): number =>
	Math.ceil(text.length / CHARACTERS_PER_TOKEN);

const textFromContent = (content: unknown): string => {
	if (typeof content === "string") return content;
	return contentParts(content)
		.map((p) => (p.type === "text" && typeof p.text === "string" ? p.text : ""))
		.join("");
};

const imageCount = (content: unknown): number =>
	contentParts(content).filter((p) => p.type === "image").length;

const estimateContentTokens = (content: unknown): number =>
	estimateTextTokens(textFromContent(content)) +
	imageCount(content) * IMAGE_TOKEN_ESTIMATE;

const estimateToolCallTokens = (part: Record<string, unknown>): number => {
	const name = typeof part.name === "string" ? part.name : "";
	const args = JSON.stringify(part.arguments ?? {});
	return estimateTextTokens(`${name}${args}`);
};

const addAssistantTokens = (
	segments: Record<ContextSegmentKey, number>,
	content: unknown,
): void => {
	for (const part of contentParts(content)) {
		if (part.type === "text" && typeof part.text === "string") {
			segments.assistant += estimateTextTokens(part.text);
		} else if (part.type === "thinking" && typeof part.thinking === "string") {
			segments.thinking += estimateTextTokens(part.thinking);
		} else if (part.type === "toolCall") {
			segments.assistant += estimateToolCallTokens(part);
		} else if (part.type === "image") {
			// Rare on assistant messages today but counted for symmetry with user
			// content (and forward-compat with vision-out models).
			segments.assistant += IMAGE_TOKEN_ESTIMATE;
		}
	}
};

export function segmentMessages(
	messages: readonly unknown[],
	systemPrompt: string,
): ContextSegments {
	const segments = emptySegments();
	segments.system = estimateTextTokens(systemPrompt);
	for (const message of messages) {
		if (!isRecord(message)) continue;
		if (message.role === "user") {
			segments.prompt += estimateContentTokens(message.content);
		} else if (message.role === "assistant") {
			addAssistantTokens(segments, message.content);
		} else if (message.role === "toolResult") {
			segments.tools += estimateContentTokens(message.content);
		}
	}
	return segments;
}

export const segmentTotal = (segments: ContextSegments): number =>
	SEGMENT_KEYS.reduce((sum, k) => sum + segments[k], 0);

/**
 * Largest-remainder method: each segment gets the floor of its fair share,
 * then leftover slots go to the segments with the biggest fractional parts.
 * Preserves the property that the per-segment counts sum to exactly `target`.
 *
 * Degenerate inputs:
 * - target <= 0 → return empty segments (nothing to allocate).
 * - total <= 0 (no estimated content) → return the input unchanged; the caller
 *   would have to invent the segment distribution and we'd rather show empty.
 */
export function scaleSegmentsToTarget(
	segments: ContextSegments,
	target: number,
): ContextSegments {
	if (target <= 0) return emptySegments();
	const total = segmentTotal(segments);
	if (total <= 0) return segments;
	const rounded = Math.round(target);
	const raw = SEGMENT_KEYS.map((k) => (segments[k] / total) * rounded);
	const out = raw.map(Math.floor);
	let remaining = rounded - out.reduce((s, v) => s + v, 0);
	const order = raw
		.map((v, i) => ({ i, frac: v - Math.floor(v) }))
		.sort((a, b) => b.frac - a.frac);
	for (let n = 0; n < order.length && remaining > 0; n++, remaining--) {
		// biome-ignore lint/style/noNonNullAssertion: order is built from raw, lengths match
		out[order[n]!.i] += 1;
	}
	const scaled = emptySegments();
	SEGMENT_KEYS.forEach((k, i) => {
		scaled[k] = out[i] ?? 0;
	});
	return scaled;
}

export function buildContextBreakdown(input: {
	messages: readonly unknown[];
	systemPrompt: string;
	measuredTokens: number | null;
	contextWindow: number;
}): ContextBreakdown {
	const raw = segmentMessages(input.messages, input.systemPrompt);
	const estimated = segmentTotal(raw);
	const usedTokens =
		typeof input.measuredTokens === "number" && input.measuredTokens > 0
			? input.measuredTokens
			: estimated;
	const segments = scaleSegmentsToTarget(raw, usedTokens);
	const contextWindow = input.contextWindow;
	return {
		segments,
		usedTokens,
		contextWindow,
		freeTokens: Math.max(0, contextWindow - usedTokens),
		usageIsEstimated: !(
			typeof input.measuredTokens === "number" && input.measuredTokens > 0
		),
	};
}

export function sumAssistantUsage(messages: readonly unknown[]): UsageTotals {
	const totals: UsageTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
	for (const message of messages) {
		if (!isRecord(message) || message.role !== "assistant") continue;
		const usage = message.usage;
		if (!isRecord(usage)) continue;
		if (typeof usage.input === "number") totals.input += usage.input;
		if (typeof usage.output === "number") totals.output += usage.output;
		if (typeof usage.cacheRead === "number")
			totals.cacheRead += usage.cacheRead;
		if (typeof usage.cacheWrite === "number") {
			totals.cacheWrite += usage.cacheWrite;
		}
		const cost = isRecord(usage.cost) ? usage.cost.total : undefined;
		if (typeof cost === "number") totals.cost += cost;
	}
	return totals;
}

export function formatTokens(n: number): string {
	const v = Math.max(0, Math.round(n));
	if (v < 1000) return String(v);
	if (v < 10_000) return `${(v / 1000).toFixed(1)}k`;
	if (v < 1_000_000) return `${Math.round(v / 1000)}k`;
	if (v < 10_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
	return `${Math.round(v / 1_000_000)}M`;
}
