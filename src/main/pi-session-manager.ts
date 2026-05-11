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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
	AgentSession,
	AuthStorage,
	ModelRegistry,
	ResourceLoader,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { PiEvent } from "../shared/pi-events";
import type { TimelineEntry } from "../shared/timeline-types";
import { agentMessagesToTimeline } from "./pi-history";
import type { AppSettingsRepo } from "./repos/app-settings";
import { ensureResourceRoot } from "./resource-root";

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

export interface SessionPathStore {
	getSessionFilePath(piSessionId: string): string | null;
	setSessionFilePath(piSessionId: string, path: string): void;
}

export interface PiSessionManagerDeps {
	appSettings: AppSettingsRepo;
	homeDir: string;
}

export class PiSessionManager {
	private readonly active = new Map<string, ActiveSession>();
	private readonly listeners = new Set<PiEventListener>();
	private ctx: PiContext | null = null;
	/**
	 * Test-only hook. The layer-3 harness sets this before calling
	 * createSession to bypass the real auth/registry/resource discovery.
	 */
	__testOverrides: PiTestOverrides | undefined;
	private pathStore?: SessionPathStore;

	constructor(private readonly deps?: PiSessionManagerDeps) {}

	setPathStore(store: SessionPathStore): void {
		this.pathStore = store;
	}

	private buildResourceLoader(
		ctx: PiContext,
		cwd: string,
	): ResourceLoader | undefined {
		// Test overrides win — they inject in-memory loaders.
		const ov = this.__testOverrides;
		if (ov?.resourceLoader) return ov.resourceLoader;
		// Production path: only construct our own loader when deps are wired.
		if (!this.deps) return undefined;
		const agentDir = ensureResourceRoot(
			this.deps.appSettings.getAll(),
			this.deps.homeDir,
		);
		return new ctx.mod.DefaultResourceLoader({
			cwd,
			agentDir,
		});
	}

	onEvent(listener: PiEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Constructs a one-shot DefaultResourceLoader using the configured
	 * resourceRoot and returns the discovered skills. Used by SkillsService
	 * for list/read calls outside an active session.
	 */
	async loadSkills(): Promise<
		Array<{ name: string; source?: { id?: string }; filePath?: string }>
	> {
		if (!this.deps) {
			throw new Error("PiSessionManager requires deps for loadSkills");
		}
		const ctx = await this.ensureContext();
		const agentDir = ensureResourceRoot(
			this.deps.appSettings.getAll(),
			this.deps.homeDir,
		);
		const loader = new ctx.mod.DefaultResourceLoader({
			cwd: this.deps.homeDir,
			agentDir,
		});
		const result = loader.getSkills();
		return result.skills as Array<{
			name: string;
			source?: { id?: string };
			filePath?: string;
		}>;
	}

	/** Re-broadcasts an event to all subscribed listeners. Used by services
	 *  outside the SDK turn loop (e.g., package installs) to surface progress. */
	broadcastEvent(event: PiEvent): void {
		this.emit(event);
	}

	/** Constructs a one-shot DefaultPackageManager using the configured
	 *  resourceRoot. Caller is responsible for setProgressCallback lifecycle. */
	async loadPackageManager(): Promise<{
		installAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<void>;
		removeAndPersist: (
			source: string,
			options?: { local?: boolean },
		) => Promise<boolean>;
		setProgressCallback: (
			cb:
				| ((e: {
						type: string;
						action: string;
						source: string;
						message?: string;
				  }) => void)
				| undefined,
		) => void;
	}> {
		if (!this.deps) {
			throw new Error("PiSessionManager requires deps for loadPackageManager");
		}
		const ctx = await this.ensureContext();
		const agentDir = ensureResourceRoot(
			this.deps.appSettings.getAll(),
			this.deps.homeDir,
		);
		// Pi exports SettingsManager (with a static `create` factory) rather than a
		// DefaultSettingsManager class. Construct it pointed at the same agentDir
		// so package state lands in resourceRoot.
		const settingsManager = ctx.mod.SettingsManager.create(
			this.deps.homeDir,
			agentDir,
		);
		return new ctx.mod.DefaultPackageManager({
			cwd: this.deps.homeDir,
			agentDir,
			settingsManager,
		});
	}

	async createSession(opts: {
		cwd: string;
	}): Promise<{ piSessionId: string; sessionFilePath: string | null }> {
		const ctx = await this.ensureContext();
		const ov = this.__testOverrides;
		const result = await ctx.mod.createAgentSession({
			cwd: opts.cwd,
			authStorage: ov?.authStorage ?? ctx.auth,
			modelRegistry: ov?.modelRegistry ?? ctx.registry,
			resourceLoader: this.buildResourceLoader(ctx, opts.cwd),
			settingsManager: ov?.settingsManager,
			model: ov?.model,
		});
		const session = result.session;
		const piSessionId = session.sessionId;
		const sessionFilePath = session.sessionFile ?? null;
		const unsubscribe = session.subscribe((event) =>
			this.translate(piSessionId, event),
		);
		this.active.set(piSessionId, { piSessionId, session, unsubscribe });
		return { piSessionId, sessionFilePath };
	}

	async attachSession(opts: { piSessionId: string }): Promise<void> {
		if (this.active.has(opts.piSessionId)) return;
		const ctx = await this.ensureContext();

		let filePath = this.pathStore?.getSessionFilePath(opts.piSessionId) ?? null;
		if (!filePath) {
			filePath = discoverSessionFile(opts.piSessionId);
			if (!filePath) {
				throw new Error(
					`session file not found on disk for ${opts.piSessionId}. ` +
						`Tried ~/.pi/agent/sessions/**/<id>.jsonl.`,
				);
			}
			this.pathStore?.setSessionFilePath(opts.piSessionId, filePath);
		}

		const ov = this.__testOverrides;
		const sessionManager = ctx.mod.SessionManager.open(filePath);
		const result = await ctx.mod.createAgentSession({
			cwd: sessionManager.getCwd(),
			authStorage: ov?.authStorage ?? ctx.auth,
			modelRegistry: ov?.modelRegistry ?? ctx.registry,
			resourceLoader: this.buildResourceLoader(ctx, sessionManager.getCwd()),
			settingsManager: ov?.settingsManager,
			model: ov?.model,
			sessionManager,
		});
		const session = result.session;
		const piSessionId = session.sessionId;
		const unsubscribe = session.subscribe((event) =>
			this.translate(piSessionId, event),
		);
		this.active.set(piSessionId, { piSessionId, session, unsubscribe });
	}

	getHistory(piSessionId: string): TimelineEntry[] {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		return agentMessagesToTimeline(active.session.messages);
	}

	async prompt(
		piSessionId: string,
		text: string,
		streamingBehavior?: "steer" | "followUp",
	): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		try {
			await active.session.prompt(text, {
				source: "interactive",
				streamingBehavior,
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			const code = classifyError(message);
			this.emit({ type: "session.error", piSessionId, code, message });
			// Do not rethrow: the IPC layer treats prompt delivery as successful
			// (pi received the prompt); the error is surfaced as a banner event.
		}
	}

	async clearQueue(
		piSessionId: string,
	): Promise<{ steering: string[]; followUp: string[] }> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		return active.session.clearQueue();
	}

	/**
	 * Remove a single item from the steering or followUp queue. Pi has no
	 * per-item remove API, so we reconcile: clearQueue() returns and empties
	 * both queues atomically; we then re-queue every survivor via prompt()
	 * with the matching streamingBehavior. The clear→re-queue gap is short
	 * but technically a race — a turn could end between the two calls. For
	 * macpi's single-user IPC pattern this is acceptable; if it ever becomes
	 * a problem, swap to a renderer-side intent queue.
	 */
	async removeFromQueue(
		piSessionId: string,
		queue: "steering" | "followUp",
		index: number,
	): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		const cleared = await active.session.clearQueue();
		const steering =
			queue === "steering"
				? cleared.steering.filter((_, i) => i !== index)
				: cleared.steering;
		const followUp =
			queue === "followUp"
				? cleared.followUp.filter((_, i) => i !== index)
				: cleared.followUp;
		for (const text of steering) {
			await active.session.prompt(text, {
				source: "interactive",
				streamingBehavior: "steer",
			});
		}
		for (const text of followUp) {
			await active.session.prompt(text, {
				source: "interactive",
				streamingBehavior: "followUp",
			});
		}
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

	/**
	 * Tear down a single active session if loaded. No-op if not loaded.
	 * Used by session/channel deletion. Does not delete pi's session file
	 * on disk — that's preserved for recoverability.
	 */
	disposeSession(piSessionId: string): void {
		const active = this.active.get(piSessionId);
		if (!active) return;
		active.unsubscribe();
		this.active.delete(piSessionId);
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

export function classifyError(
	message: string,
): "auth" | "model" | "transient" | "unknown" {
	const lower = message.toLowerCase();
	if (
		lower.includes("auth") ||
		lower.includes("401") ||
		lower.includes("403") ||
		lower.includes("unauthorized")
	) {
		return "auth";
	}
	if (lower.includes("model") && lower.includes("not found")) {
		return "model";
	}
	if (
		lower.includes("timeout") ||
		lower.includes("econnreset") ||
		lower.includes("etimedout")
	) {
		return "transient";
	}
	return "unknown";
}

function discoverSessionFile(piSessionId: string): string | null {
	const root = path.join(os.homedir(), ".pi", "agent", "sessions");
	if (!fs.existsSync(root)) return null;
	for (const dir of fs.readdirSync(root)) {
		const dirPath = path.join(root, dir);
		const stat = fs.statSync(dirPath);
		if (!stat.isDirectory()) continue;
		for (const file of fs.readdirSync(dirPath)) {
			if (file.endsWith(`${piSessionId}.jsonl`)) {
				return path.join(dirPath, file);
			}
		}
	}
	return null;
}
