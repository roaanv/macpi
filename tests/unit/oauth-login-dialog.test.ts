// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthEvent } from "../../src/shared/model-auth-types";

const mocks = vi.hoisted(() => ({
	start: {
		mutateAsync: vi.fn(),
		reset: vi.fn(),
		error: null as Error | null,
		isPending: false,
	},
	respond: { mutate: vi.fn() },
	cancel: { mutate: vi.fn() },
	invoke: vi.fn(),
	listener: null as ((event: OAuthEvent) => void) | null,
	unsubscribe: vi.fn(),
}));

vi.mock("../../src/renderer/queries", () => ({
	useStartOAuthLogin: () => mocks.start,
	useRespondOAuthPrompt: () => mocks.respond,
	useCancelOAuthLogin: () => mocks.cancel,
}));

vi.mock("../../src/renderer/ipc", () => ({
	invoke: mocks.invoke,
	onOAuthEvent: (listener: (event: OAuthEvent) => void) => {
		mocks.listener = listener;
		return mocks.unsubscribe;
	},
}));

import { OAuthLoginDialog } from "../../src/renderer/components/OAuthLoginDialog";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const provider = "anthropic";
let container: HTMLDivElement;
let root: Root;
let onClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	onClose = vi.fn();
	mocks.start.mutateAsync.mockReset();
	mocks.start.reset.mockReset();
	mocks.start.reset.mockImplementation(() => {
		mocks.start.error = null;
	});
	mocks.start.error = null;
	mocks.start.isPending = false;
	mocks.respond.mutate.mockReset();
	mocks.cancel.mutate.mockReset();
	mocks.invoke.mockReset();
	mocks.unsubscribe.mockReset();
	mocks.listener = null;
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

function result(loginId: string, events: OAuthEvent[]) {
	return { loginId, events };
}

async function renderDialog() {
	await act(async () => {
		root.render(React.createElement(OAuthLoginDialog, { provider, onClose }));
	});
}

async function rerenderDialog() {
	await act(async () => {
		root.render(React.createElement(OAuthLoginDialog, { provider, onClose }));
	});
}

function button(name: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find(
		(candidate) => candidate.textContent?.trim() === name,
	);
	if (!match) throw new Error(`Button not found: ${name}`);
	return match;
}

async function click(element: Element) {
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("OAuthLoginDialog", () => {
	it("shows the active URL controls and cancels the current login", async () => {
		mocks.start.mutateAsync.mockResolvedValue(
			result("login-1", [
				{
					type: "oauth.authUrl",
					loginId: "login-1",
					provider,
					url: "https://example.com/oauth",
					instructions: "Continue in your browser",
				},
			]),
		);
		await renderDialog();

		expect(container.textContent).toContain("https://example.com/oauth");
		expect(
			container.querySelector(".type-section-heading")?.textContent,
		).toContain("OAuth login");
		expect(
			[...container.querySelectorAll(".type-code.type-technical-wrap")].some(
				(element) => element.textContent?.includes("https://example.com/oauth"),
			),
		).toBe(true);
		await click(button("Open Browser"));
		expect(mocks.invoke).toHaveBeenCalledWith("system.openExternalUrl", {
			url: "https://example.com/oauth",
		});
		await click(button("Cancel"));
		expect(mocks.cancel.mutate).toHaveBeenCalledWith({ loginId: "login-1" });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("renders the exact accessible success card and hides URL controls", async () => {
		mocks.start.mutateAsync.mockResolvedValue(
			result("login-1", [
				{
					type: "oauth.authUrl",
					loginId: "login-1",
					provider,
					url: "https://example.com/oauth",
				},
				{ type: "oauth.success", loginId: "login-1", provider },
			]),
		);
		await renderDialog();

		const status = container.querySelector('[role="status"]');
		expect(status?.getAttribute("aria-live")).toBe("polite");
		expect(status?.textContent).toContain("Login successful");
		expect(status?.textContent).toContain("Your OAuth token was saved.");
		expect(container.textContent).not.toContain("https://example.com/oauth");
		expect(
			[...container.querySelectorAll("button")].some(
				(item) => item.textContent === "Open Browser",
			),
		).toBe(false);
		await click(button("Done"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("shows the actual error with Close and Try again actions", async () => {
		mocks.start.mutateAsync
			.mockResolvedValueOnce(
				result("login-1", [
					{
						type: "oauth.error",
						loginId: "login-1",
						provider,
						message: "Authentication was rejected",
					},
				]),
			)
			.mockReturnValueOnce(new Promise(() => {}));
		await renderDialog();

		expect(container.textContent).toContain("Login failed");
		expect(container.textContent).toContain("Authentication was rejected");
		expect(button("Try again")).toBeTruthy();
		await click(button("Close"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("retries the same provider once and clears the stale result", async () => {
		const retry = deferred<ReturnType<typeof result>>();
		mocks.start.mutateAsync
			.mockResolvedValueOnce(
				result("login-1", [
					{
						type: "oauth.error",
						loginId: "login-1",
						provider,
						message: "Old failure",
					},
				]),
			)
			.mockReturnValueOnce(retry.promise);
		await renderDialog();
		await click(button("Try again"));

		expect(mocks.start.mutateAsync).toHaveBeenCalledTimes(2);
		expect(mocks.start.mutateAsync).toHaveBeenNthCalledWith(2, { provider });
		expect(container.textContent).not.toContain("Old failure");
		expect(container.textContent).toContain("Starting login…");
	});

	it("makes a rejected initial start retryable without adopting a stale event", async () => {
		const initialStart = deferred<ReturnType<typeof result>>();
		mocks.start.mutateAsync.mockReturnValueOnce(initialStart.promise);
		await renderDialog();
		await act(async () => {
			mocks.listener?.({
				type: "oauth.error",
				loginId: "stale-login",
				provider,
				message: "Stale failure",
			});
			mocks.start.error = new Error("Could not start OAuth login");
			initialStart.reject(mocks.start.error);
			await initialStart.promise.catch(() => undefined);
		});
		// React Query's error state update causes this render in the application.
		await rerenderDialog();

		expect(container.textContent).toContain("Could not start OAuth login");
		expect(container.textContent).not.toContain("Stale failure");
		mocks.start.mutateAsync.mockReturnValueOnce(new Promise(() => {}));
		await click(button("Try again"));
		expect(mocks.start.mutateAsync).toHaveBeenCalledTimes(2);
		expect(mocks.start.mutateAsync).toHaveBeenLastCalledWith({ provider });
	});

	it("keeps result details collapsed until expanded", async () => {
		mocks.start.mutateAsync.mockResolvedValue(
			result("login-1", [
				{
					type: "oauth.progress",
					loginId: "login-1",
					provider,
					message: "Authorizing token",
				},
				{ type: "oauth.success", loginId: "login-1", provider },
			]),
		);
		await renderDialog();

		const details = button("Authentication details");
		expect(details.getAttribute("aria-expanded")).toBe("false");
		expect(container.textContent).not.toContain("Authorizing token");
		await click(details);
		expect(details.getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toContain("Authorizing token");
	});

	it("buffers same-provider events but ignores a stale login ID", async () => {
		const start = deferred<ReturnType<typeof result>>();
		mocks.start.mutateAsync.mockReturnValue(start.promise);
		await renderDialog();

		await act(async () => {
			mocks.listener?.({
				type: "oauth.error",
				loginId: "stale-login",
				provider,
				message: "Stale failure",
			});
			mocks.listener?.({
				type: "oauth.progress",
				loginId: "current-login",
				provider,
				message: "Current login",
			});
			start.resolve(result("current-login", []));
			await start.promise;
		});

		expect(container.textContent).toContain("Current login");
		expect(container.textContent).not.toContain("Stale failure");
		await act(async () => {
			mocks.listener?.({
				type: "oauth.error",
				loginId: "stale-login",
				provider,
				message: "Late stale failure",
			});
		});
		expect(container.textContent).not.toContain("Login failed");
	});

	it("does not present cancellation as failure", async () => {
		mocks.start.mutateAsync.mockResolvedValue(
			result("login-1", [
				{ type: "oauth.cancelled", loginId: "login-1", provider },
			]),
		);
		await renderDialog();

		expect(container.textContent).not.toContain("Login failed");
		expect(button("Cancel")).toBeTruthy();
	});
});
