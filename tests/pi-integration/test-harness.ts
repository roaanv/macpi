// Layer-3 test harness for PiSessionManager. Stands up an in-memory pi-coding-agent
// using the faux provider from @earendil-works/pi-ai so tests can script assistant
// responses (text, thinking, tool calls) and assert on event forwarding.
//
// Pattern mirrors the SDK's `12-full-control.ts` example but trimmed for testing.
// All discovery is suppressed (no skills, no extensions, no AGENTS.md).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	type PiEvent,
	type PiEventListener,
	PiSessionManager,
} from "../../src/main/pi-session-manager";

const FAUX_DUMMY_API_KEY = "faux-key-for-tests";
const DEFAULT_TURN_TIMEOUT_MS = 10_000;
const DEFAULT_TOKEN_SIZE = { min: 2, max: 4 } as const;

class WaitCancelledError extends Error {
	constructor() {
		super("waitForEvent cancelled");
		this.name = "WaitCancelledError";
	}
}

export interface Harness {
	manager: PiSessionManager;
	cwd: string;
	/** Queue one scripted assistant response. */
	queueResponse: (message: AssistantMessage | (() => AssistantMessage)) => void;
	/** Capture every event emitted by the manager. */
	captured: PiEvent[];
	/** Subscribe with a custom listener (returns unsubscribe). */
	subscribe: (listener: PiEventListener) => () => void;
	/** Tear down the harness — kill in-flight responses, free temp dirs. */
	dispose: () => void;
}

export async function createHarness(): Promise<Harness> {
	// Dynamic import: pi-ai is ESM-only (same constraint as pi-coding-agent).
	const piAi = await import("@earendil-works/pi-ai");
	const piCoding = await import("@earendil-works/pi-coding-agent");

	const fauxRegistration = piAi.registerFauxProvider({
		api: "test-faux",
		provider: "test-faux",
		models: [{ id: "faux-test-1", name: "Faux Test" }],
		// Stream a few tokens at a time, no artificial delay.
		tokenSize: DEFAULT_TOKEN_SIZE,
	});

	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "macpi-pi-test-"));

	// PiSessionManager loads pi via dynamic import internally. The harness
	// reaches into the same SDK to construct the in-memory dependencies pi
	// needs to skip discovery.
	const authStorage = piCoding.AuthStorage.create(path.join(cwd, "auth.json"));
	// AgentSession's _getRequiredRequestAuth still throws "No API key found"
	// when neither an API key nor OAuth credentials are configured for the
	// model's provider — even though the faux provider doesn't actually need
	// one. Set a dummy runtime key so the auth check passes.
	authStorage.setRuntimeApiKey("test-faux", FAUX_DUMMY_API_KEY);
	const modelRegistry = piCoding.ModelRegistry.inMemory(authStorage);

	// Use the faux registration's own getModel() — `piAi.getModel` is typed
	// only for KnownProvider names, and "test-faux" is not one.
	const model = fauxRegistration.getModel();

	// Build a minimal in-memory ResourceLoader (no skills/extensions/prompts).
	const resourceLoader = {
		getExtensions: () => ({
			extensions: [],
			errors: [],
			runtime: piCoding.createExtensionRuntime(),
		}),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => "You are a test assistant. Be concise.",
		getAppendSystemPrompt: () => [],
		extendResources: () => {},
		reload: async () => {},
	};

	const settingsManager = piCoding.SettingsManager.inMemory({
		compaction: { enabled: false },
		retry: { enabled: false },
	});

	// Replace the manager's default ensureContext with a test-configured one.
	// PiSessionManager exposes only public methods; we attach a hidden hook
	// here that Task 4 will wire through to drive the underlying SDK with our
	// pre-built dependencies. Until Task 4 lands, this hook is inert.
	const manager = new PiSessionManager();

	// TODO(task-4): PiSessionManager does not yet read __testOverrides — the
	// hook is staged here so tests can be written against the harness shape.
	(manager as unknown as { __testOverrides: unknown }).__testOverrides = {
		authStorage,
		modelRegistry,
		resourceLoader,
		settingsManager,
		model,
	};

	const captured: PiEvent[] = [];
	// Capture the unsubscribe so dispose() can detach the listener even if
	// shutdown() ever stops clearing the listener set on its own.
	const unsubscribeCaptured = manager.onEvent((event) => captured.push(event));

	return {
		manager,
		cwd,
		queueResponse: (message) => {
			// The faux provider accepts AssistantMessage values or
			// FauxResponseFactory functions of shape
			// (context, options, state, model) => AssistantMessage. The
			// harness API exposes a simpler 0-arg factory; wrap it.
			if (typeof message === "function") {
				fauxRegistration.appendResponses([() => message()]);
			} else {
				fauxRegistration.appendResponses([message]);
			}
		},
		captured,
		subscribe: (listener) => manager.onEvent(listener),
		dispose: () => {
			unsubscribeCaptured();
			manager.shutdown();
			fauxRegistration.unregister();
			fs.rmSync(cwd, { recursive: true, force: true });
		},
	};
}

/**
 * Drive a session: create it, prompt, await turn end (or timeout), return
 * captured events for that turn. Caller is responsible for queuing responses
 * BEFORE calling drive().
 *
 * If `prompt()` rejects, we cancel the turn_end waiter explicitly so its
 * listener and timeout don't leak (the older shape leaked both until the
 * 10s timeout fired). Cancellation rejects the wait promise with a
 * WaitCancelledError sentinel so a natural turn_end is distinguishable from
 * a forced cancel.
 */
export async function drive(
	harness: Harness,
	prompt: string,
	options: { timeoutMs?: number } = {},
): Promise<{ piSessionId: string; events: PiEvent[] }> {
	const before = harness.captured.length;
	const { piSessionId } = await harness.manager.createSession({
		cwd: harness.cwd,
	});
	const turnEnd = waitForEvent(
		harness,
		(e) => e.type === "session.turn_end" && e.piSessionId === piSessionId,
		options.timeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
	);
	try {
		await harness.manager.prompt(piSessionId, prompt);
	} catch (err) {
		turnEnd.cancel();
		// Surface the prompt error; ignore the resulting WaitCancelledError.
		try {
			await turnEnd.promise;
		} catch {
			/* expected cancel */
		}
		throw err;
	}
	await turnEnd.promise;
	return { piSessionId, events: harness.captured.slice(before) };
}

// Re-exports so tests don't each have to await import("@earendil-works/pi-ai").
// We do this inside an async exporter helper; consumers can `import { fauxHelpers } from "./test-harness"`
// and then `await fauxHelpers()` to get them. Direct re-export from an ESM-only
// package would force this file to be treated as ESM by the CJS bundle pathway,
// so we provide a function instead.
export async function fauxHelpers() {
	const piAi = await import("@earendil-works/pi-ai");
	return {
		fauxAssistantMessage: piAi.fauxAssistantMessage,
		fauxText: piAi.fauxText,
		fauxThinking: piAi.fauxThinking,
		fauxToolCall: piAi.fauxToolCall,
	};
}

interface WaitHandle {
	promise: Promise<void>;
	cancel: () => void;
}

function waitForEvent(
	harness: Harness,
	predicate: (event: PiEvent) => boolean,
	timeoutMs: number,
): WaitHandle {
	let settled = false;
	let resolveFn!: () => void;
	let rejectFn!: (err: Error) => void;
	const promise = new Promise<void>((resolve, reject) => {
		resolveFn = resolve;
		rejectFn = reject;
	});
	const timer = setTimeout(() => {
		if (settled) return;
		settled = true;
		unsubscribe();
		rejectFn(new Error(`waitForEvent timed out after ${timeoutMs}ms`));
	}, timeoutMs);
	const unsubscribe = harness.subscribe((event) => {
		if (settled) return;
		if (predicate(event)) {
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			resolveFn();
		}
	});
	return {
		promise,
		cancel: () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			rejectFn(new WaitCancelledError());
		},
	};
}
