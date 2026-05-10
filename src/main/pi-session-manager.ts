// In-process owner of pi-coding-agent AgentSession instances. Lives in the
// Electron main process; pi runs alongside the rest of main. Direct method
// calls from the IPC router — no wire format, no correlation IDs, no
// subprocess.
//
// Loading note: pi-coding-agent's package.json exports only the "import"
// (ESM) condition — there is no "require" entry. Our Forge main bundle is
// CJS, so we cannot use a static `import` of value bindings. Instead we
// pull the module in via dynamic `import()`, cached behind ensureContext().
// The module is externalized in vite.main.config.ts so it resolves to
// node_modules at runtime and pi can find its own templates/themes/wasm.

import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	AgentSession,
	AuthStorage,
	ModelRegistry,
	ResourceLoader,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { PiEvent } from "../shared/pi-events";

type PiCodingModule = typeof import("@earendil-works/pi-coding-agent");

interface PiContext {
	mod: PiCodingModule;
	auth: AuthStorage;
	registry: ModelRegistry;
	resourceLoader?: ResourceLoader;
	settingsManager?: SettingsManager;
	model?: Model<Api>;
}

let piPromise: Promise<PiCodingModule> | null = null;
function loadPi(): Promise<PiCodingModule> {
	if (!piPromise) piPromise = import("@earendil-works/pi-coding-agent");
	return piPromise;
}

export type PiEventListener = (event: PiEvent) => void;

interface ActiveSession {
	piSessionId: string;
	session: AgentSession;
	unsubscribe: () => void;
}

/**
 * Test-only override container. Production code always leaves this empty;
 * the layer-3 harness sets it to inject in-memory pi dependencies.
 */
export interface PiTestOverrides {
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	resourceLoader: ResourceLoader;
	settingsManager: SettingsManager;
	model: Model<Api>;
}

export type { PiEvent } from "../shared/pi-events";

export class PiSessionManager {
	private readonly active = new Map<string, ActiveSession>();
	private readonly listeners = new Set<PiEventListener>();
	private ctx: PiContext | null = null;
	/**
	 * Test-only hook. The layer-3 harness sets this before calling
	 * createSession to bypass the real auth/registry/resource discovery.
	 */
	__testOverrides: PiTestOverrides | undefined;

	onEvent(listener: PiEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async createSession(opts: { cwd: string }): Promise<string> {
		const ctx = await this.ensureContext();
		const ov = this.__testOverrides;
		const result = await ctx.mod.createAgentSession({
			cwd: opts.cwd,
			authStorage: ov?.authStorage ?? ctx.auth,
			modelRegistry: ov?.modelRegistry ?? ctx.registry,
			resourceLoader: ov?.resourceLoader,
			settingsManager: ov?.settingsManager,
			model: ov?.model,
		});
		const session = result.session;
		const piSessionId = session.sessionId;
		const unsubscribe = session.subscribe((event) =>
			this.translate(piSessionId, event),
		);
		this.active.set(piSessionId, { piSessionId, session, unsubscribe });
		return piSessionId;
	}

	async prompt(
		piSessionId: string,
		text: string,
		streamingBehavior?: "steer" | "followUp",
	): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		await active.session.prompt(text, {
			source: "interactive",
			streamingBehavior,
		});
	}

	async clearQueue(
		piSessionId: string,
	): Promise<{ steering: string[]; followUp: string[] }> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		return active.session.clearQueue();
	}

	async abort(piSessionId: string): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		await active.session.abort();
	}

	shutdown(): void {
		for (const a of this.active.values()) a.unsubscribe();
		this.active.clear();
		this.listeners.clear();
	}

	private async ensureContext(): Promise<PiContext> {
		if (this.ctx) return this.ctx;
		const mod = await loadPi();
		const auth = mod.AuthStorage.create();
		const registry = mod.ModelRegistry.create(auth);
		this.ctx = { mod, auth, registry };
		return this.ctx;
	}

	private translate(piSessionId: string, event: unknown): void {
		const e = event as { type: string } & Record<string, unknown>;
		switch (e.type) {
			case "turn_start":
				this.emit({ type: "session.turn_start", piSessionId });
				return;
			case "turn_end":
				this.emit({ type: "session.turn_end", piSessionId });
				return;
			case "message_update": {
				// We forward only the delta-bearing AssistantMessageEvent variants
				// (text_delta, thinking_delta). Other inner variants (text_start/end,
				// thinking_start/end, tool_call_*, error) are intentionally dropped —
				// the renderer reconstructs the message from delta sequences alone.
				const ame = (
					e as { assistantMessageEvent?: { type?: string; delta?: string } }
				).assistantMessageEvent;
				if (!ame || typeof ame.delta !== "string") return;
				if (ame.type === "text_delta") {
					this.emit({
						type: "session.text_delta",
						piSessionId,
						delta: ame.delta,
					});
				} else if (ame.type === "thinking_delta") {
					this.emit({
						type: "session.thinking_delta",
						piSessionId,
						delta: ame.delta,
					});
				}
				return;
			}
			case "tool_execution_start":
				this.emit({
					type: "session.tool_start",
					piSessionId,
					toolCallId: String(e.toolCallId ?? ""),
					toolName: String(e.toolName ?? ""),
					args: e.args,
				});
				return;
			case "tool_execution_end":
				this.emit({
					type: "session.tool_end",
					piSessionId,
					toolCallId: String(e.toolCallId ?? ""),
					result: e.result,
					isError: Boolean(e.isError),
				});
				return;
			case "compaction_start": {
				const raw = e.reason;
				const reason: "manual" | "threshold" | "overflow" =
					raw === "threshold" || raw === "overflow" ? raw : "manual";
				this.emit({
					type: "session.compaction_start",
					piSessionId,
					reason,
				});
				return;
			}
			case "compaction_end":
				this.emit({
					type: "session.compaction_end",
					piSessionId,
					aborted: Boolean(e.aborted),
					willRetry: Boolean(e.willRetry),
					errorMessage: e.errorMessage as string | undefined,
				});
				return;
			case "auto_retry_start":
				this.emit({
					type: "session.retry_start",
					piSessionId,
					attempt: Number(e.attempt ?? 0),
					maxAttempts: Number(e.maxAttempts ?? 0),
					delayMs: Number(e.delayMs ?? 0),
					errorMessage: String(e.errorMessage ?? ""),
				});
				return;
			case "auto_retry_end":
				this.emit({
					type: "session.retry_end",
					piSessionId,
					success: Boolean(e.success),
					attempt: Number(e.attempt ?? 0),
					finalError: e.finalError as string | undefined,
				});
				return;
			case "queue_update":
				this.emit({
					type: "session.queue_update",
					piSessionId,
					steering: (e.steering as readonly string[]) ?? [],
					followUp: (e.followUp as readonly string[]) ?? [],
				});
				return;
			// Other AgentSessionEvent kinds (agent_start, agent_end, message_start,
			// message_end, tool_execution_update, session_info_changed,
			// thinking_level_changed) are intentionally ignored. Plan 3+ may
			// surface session_info_changed for the breadcrumb.
		}
	}

	private emit(event: PiEvent) {
		for (const l of this.listeners) l(event);
	}
}
