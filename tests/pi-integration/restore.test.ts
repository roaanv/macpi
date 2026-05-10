import { afterEach, describe, expect, it } from "vitest";
import {
	createHarness,
	drive,
	fauxHelpers,
	type Harness,
} from "./test-harness";

describe("layer-3: session restore", () => {
	let harness: Harness | null = null;

	afterEach(() => {
		harness?.dispose();
		harness = null;
	});

	it("attachSession on a fresh manager replays the persisted history", async () => {
		// Phase 1: create + prompt with the original harness.
		harness = await createHarness();
		const { fauxAssistantMessage, fauxText } = await fauxHelpers();
		harness.queueResponse(fauxAssistantMessage(fauxText("hello world")));

		const { piSessionId } = await drive(harness, "say hi");

		// Pi persists session messages on message_end. Pull the sessionFile
		// from the active map before disposing.
		const sessionFile = (
			harness.manager as unknown as {
				active: Map<string, { session: { sessionFile?: string } }>;
			}
		).active.get(piSessionId)?.session.sessionFile;
		expect(sessionFile, "expected pi to persist a session file").toBeTruthy();

		// Phase 2: simulate restart — dispose the manager, then build a fresh
		// one and attach to the same session.
		harness.dispose();
		harness = await createHarness();

		// Inject the path so attachSession doesn't have to scan disk.
		// (The actual app uses the DB-backed pathStore; in tests we wire it
		// inline.)
		const captured: { id: string; path: string } = {
			id: piSessionId,
			path: sessionFile as string,
		};
		harness.manager.setPathStore({
			getSessionFilePath: (id) => (id === captured.id ? captured.path : null),
			setSessionFilePath: () => undefined,
		});

		await harness.manager.attachSession({ piSessionId });
		const history = harness.manager.getHistory(piSessionId);

		const userEntry = history.find((e) => e.kind === "user");
		const assistantEntry = history.find((e) => e.kind === "assistant-text");
		expect(userEntry, "expected user message in restored history").toBeTruthy();
		expect((userEntry as { text: string }).text).toBe("say hi");
		expect(
			assistantEntry,
			"expected assistant message in restored history",
		).toBeTruthy();
		expect((assistantEntry as { text: string }).text).toBe("hello world");
	});
});
