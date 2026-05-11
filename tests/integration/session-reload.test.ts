import { describe, expect, it, vi } from "vitest";
import { PiSessionManager } from "../../src/main/pi-session-manager";

describe("PiSessionManager.reloadSession", () => {
	it("aborts, disposes, then reattaches in order", async () => {
		const manager = new PiSessionManager();
		const abort = vi.spyOn(manager, "abort").mockResolvedValue();
		const dispose = vi.spyOn(manager, "disposeSession").mockReturnValue();
		const attach = vi.spyOn(manager, "attachSession").mockResolvedValue();
		// Force an active entry so the unknown-session guard doesn't fire.
		// biome-ignore lint/suspicious/noExplicitAny: test reaches into internals
		(manager as any).active.set("s1", { piSessionId: "s1" });

		await manager.reloadSession("s1");

		expect(abort).toHaveBeenCalledWith("s1");
		expect(dispose).toHaveBeenCalledWith("s1");
		expect(attach).toHaveBeenCalledWith({ piSessionId: "s1" });
		// Order check via mock invocation order:
		const abortIdx = abort.mock.invocationCallOrder[0];
		const disposeIdx = dispose.mock.invocationCallOrder[0];
		const attachIdx = attach.mock.invocationCallOrder[0];
		expect(abortIdx).toBeLessThan(disposeIdx);
		expect(disposeIdx).toBeLessThan(attachIdx);
	});

	it("continues to dispose+reattach even if abort throws", async () => {
		const manager = new PiSessionManager();
		const abort = vi
			.spyOn(manager, "abort")
			.mockRejectedValue(new Error("not streaming"));
		const dispose = vi.spyOn(manager, "disposeSession").mockReturnValue();
		const attach = vi.spyOn(manager, "attachSession").mockResolvedValue();
		// biome-ignore lint/suspicious/noExplicitAny: test reaches into internals
		(manager as any).active.set("s1", { piSessionId: "s1" });

		await manager.reloadSession("s1");

		expect(abort).toHaveBeenCalled();
		expect(dispose).toHaveBeenCalled();
		expect(attach).toHaveBeenCalled();
	});

	it("rejects when piSessionId is unknown", async () => {
		const manager = new PiSessionManager();
		await expect(manager.reloadSession("nope")).rejects.toThrow(/unknown/);
	});
});
