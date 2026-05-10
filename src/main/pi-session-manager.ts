// In-process owner of pi-coding-agent AgentSession instances. Lives in the
// Electron main process; pi runs alongside the rest of main. Direct method
// calls from the IPC router — no wire format, no correlation IDs, no
// subprocess.
//
// Trade-off accepted (decision D3, revised): a buggy skill or runaway tool
// call can block main's event loop. We prioritize "no separate process" —
// the user's original choice — over crash isolation. Crash isolation can be
// added back later via a worker_thread or utilityProcess if it becomes a
// real problem.
//
// Loading note: pi-coding-agent's package.json exports only the "import"
// (ESM) condition — there is no "require" entry. Our Forge main bundle is
// CJS, so we cannot use a static `import` of value bindings. Instead we
// pull the module in via dynamic `import()`, cached behind ensurePi(). The
// module is externalized in vite.main.config.ts so it resolves to
// node_modules at runtime and pi can find its own templates/themes/wasm.

import type {
	AgentSession,
	AuthStorage,
	ModelRegistry,
} from "@earendil-works/pi-coding-agent";

type PiModule = typeof import("@earendil-works/pi-coding-agent");

interface PiContext {
	mod: PiModule;
	auth: AuthStorage;
	registry: ModelRegistry;
}

let piPromise: Promise<PiModule> | null = null;
function loadPi(): Promise<PiModule> {
	if (!piPromise) piPromise = import("@earendil-works/pi-coding-agent");
	return piPromise;
}

export type PiEvent =
	| { type: "session.token"; piSessionId: string; delta: string }
	| { type: "session.turn_end"; piSessionId: string };

export type PiEventListener = (event: PiEvent) => void;

interface ActiveSession {
	piSessionId: string;
	session: AgentSession;
	unsubscribe: () => void;
}

export class PiSessionManager {
	private readonly active = new Map<string, ActiveSession>();
	private readonly listeners = new Set<PiEventListener>();
	private ctx: PiContext | null = null;

	onEvent(listener: PiEventListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	async createSession(opts: { cwd: string }): Promise<string> {
		const ctx = await this.ensureContext();
		const result = await ctx.mod.createAgentSession({
			cwd: opts.cwd,
			authStorage: ctx.auth,
			modelRegistry: ctx.registry,
		});
		const session = result.session;
		const piSessionId = session.sessionId;
		const unsubscribe = session.subscribe((event) => {
			// Foundation milestone forwards only token deltas and turn_end.
			if (event.type === "message_update") {
				const ame = event.assistantMessageEvent;
				if (ame.type === "text_delta" && typeof ame.delta === "string") {
					this.emit({ type: "session.token", piSessionId, delta: ame.delta });
				}
				return;
			}
			if (event.type === "turn_end") {
				this.emit({ type: "session.turn_end", piSessionId });
				return;
			}
		});
		this.active.set(piSessionId, { piSessionId, session, unsubscribe });
		return piSessionId;
	}

	async prompt(piSessionId: string, text: string): Promise<void> {
		const active = this.active.get(piSessionId);
		if (!active) throw new Error(`unknown session ${piSessionId}`);
		await active.session.prompt(text, { source: "interactive" });
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

	private emit(event: PiEvent) {
		for (const l of this.listeners) l(event);
	}
}
