import { describe, expect, it, vi } from "vitest";
import { createHarness } from "./test-harness";

describe("PiSessionManager resource loading", () => {
	it("reloads a provided resourceLoader before creating a session", async () => {
		const h = await createHarness();
		try {
			// biome-ignore lint/suspicious/noExplicitAny: test verifies hidden harness override behavior
			const overrides = (h.manager as any).__testOverrides;
			overrides.resourceLoader.reload = vi.fn().mockResolvedValue(undefined);

			await h.manager.createSession({ cwd: h.cwd });

			expect(overrides.resourceLoader.reload).toHaveBeenCalledTimes(1);
		} finally {
			h.dispose();
		}
	});
});
