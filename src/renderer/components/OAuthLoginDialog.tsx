import React from "react";
import type { OAuthEvent } from "../../shared/model-auth-types";
import { invoke, onOAuthEvent } from "../ipc";
import {
	useCancelOAuthLogin,
	useRespondOAuthPrompt,
	useStartOAuthLogin,
} from "../queries";
import { getOAuthLoginResult } from "../utils/oauth-login-result";

interface OAuthLoginDialogProps {
	provider: string | null;
	onClose: () => void;
}

export function OAuthLoginDialog({ provider, onClose }: OAuthLoginDialogProps) {
	const start = useStartOAuthLogin();
	const respond = useRespondOAuthPrompt();
	const cancel = useCancelOAuthLogin();
	const [loginId, setLoginId] = React.useState<string | null>(null);
	const [events, setEvents] = React.useState<OAuthEvent[]>([]);
	const [promptValue, setPromptValue] = React.useState("");
	const [detailsOpen, setDetailsOpen] = React.useState(false);
	const loginIdRef = React.useRef<string | null>(null);
	const bufferedEventsRef = React.useRef<OAuthEvent[]>([]);
	const attemptGenerationRef = React.useRef(0);
	const attemptInFlightRef = React.useRef(false);

	const startAttempt = React.useCallback(async () => {
		if (!provider || attemptInFlightRef.current) return;

		attemptInFlightRef.current = true;
		const generation = ++attemptGenerationRef.current;
		loginIdRef.current = null;
		bufferedEventsRef.current = [];
		setLoginId(null);
		setEvents([]);
		setPromptValue("");
		setDetailsOpen(false);
		start.reset();

		try {
			const result = await start.mutateAsync({ provider });
			if (generation !== attemptGenerationRef.current) return;

			const bufferedEvents = bufferedEventsRef.current.filter(
				(event) => event.loginId === result.loginId,
			);
			bufferedEventsRef.current = [];
			loginIdRef.current = result.loginId;
			setLoginId(result.loginId);
			setEvents(bufferedEvents.reduce(appendOAuthEvent, result.events));
		} catch {
			// The mutation exposes its error state for the retryable result card.
		} finally {
			if (generation === attemptGenerationRef.current) {
				attemptInFlightRef.current = false;
			}
		}
	}, [provider, start.mutateAsync, start.reset]);

	React.useEffect(() => {
		if (!provider) return;
		const unsubscribe = onOAuthEvent((event) => {
			if (event.provider !== provider) return;

			const currentLoginId = loginIdRef.current;
			if (!currentLoginId) {
				bufferedEventsRef.current = appendOAuthEvent(
					bufferedEventsRef.current,
					event,
				);
				return;
			}
			if (currentLoginId !== event.loginId) return;
			setEvents((previous) => appendOAuthEvent(previous, event));
		});
		return () => {
			bufferedEventsRef.current = [];
			unsubscribe();
		};
	}, [provider]);

	React.useEffect(() => {
		if (!provider) return;
		void startAttempt();
		return () => {
			attemptGenerationRef.current += 1;
			attemptInFlightRef.current = false;
			loginIdRef.current = null;
			bufferedEventsRef.current = [];
		};
	}, [provider, startAttempt]);

	if (!provider) return null;
	const result = getOAuthLoginResult(events, loginId, start.error);
	const latestPrompt = [...events]
		.reverse()
		.find(
			(event) => event.type === "oauth.prompt" || event.type === "oauth.select",
		);
	const latestUrl = [...events]
		.reverse()
		.find((event) => event.type === "oauth.authUrl");

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div className="max-w-[calc(100vw-2rem)] surface-panel flex max-h-[80vh] w-[560px] flex-col gap-3 overflow-auto rounded p-4 shadow-xl">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="type-section-heading">OAuth login</div>
						<div className="type-code type-metadata type-technical-wrap text-muted">
							{provider}
						</div>
					</div>
					<button
						type="button"
						className="rounded px-2 py-1 hover:opacity-80 type-control"
						onClick={onClose}
					>
						✕
					</button>
				</div>

				{result ? (
					<div
						className={`flex items-start gap-3 rounded border p-4 type-status ${
							result.kind === "success"
								? "border-ok surface-ok-soft text-ok"
								: "border-err surface-err-soft text-err"
						}`}
						role="status"
						aria-live="polite"
					>
						<div
							className="flex h-7 w-5 shrink-0 items-center justify-center"
							aria-hidden="true"
						>
							<svg
								aria-hidden="true"
								className="h-5 w-5"
								viewBox="0 0 20 20"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								{result.kind === "success" ? (
									<path d="m4 10 4 4 8-8" />
								) : (
									<path d="m5 5 10 10M15 5 5 15" />
								)}
							</svg>
						</div>
						<div>
							<div className="type-label">
								{result.kind === "success"
									? "Login successful"
									: "Login failed"}
							</div>
							<div className="type-status">
								{result.kind === "success"
									? "Your OAuth token was saved."
									: result.message}
							</div>
						</div>
					</div>
				) : null}

				{!result && latestUrl?.type === "oauth.authUrl" ? (
					<div className="rounded border border-border/40 p-2 type-body">
						{latestUrl.instructions ? (
							<div className="mb-2 text-muted">{latestUrl.instructions}</div>
						) : null}
						<div className="type-code type-technical-wrap text-muted">
							{latestUrl.url}
						</div>
						<button
							type="button"
							className="mt-2 rounded surface-accent-soft px-2 py-1 hover:opacity-80 type-control"
							onClick={() =>
								void invoke("system.openExternalUrl", { url: latestUrl.url })
							}
						>
							Open Browser
						</button>
					</div>
				) : null}

				{latestPrompt?.type === "oauth.prompt" && !result ? (
					<div className="flex flex-col gap-2 rounded border border-border/40 p-2 type-body">
						<label className="type-label" htmlFor="oauth-prompt-input">
							{latestPrompt.message}
						</label>
						<input
							id="oauth-prompt-input"
							className="surface-row rounded px-2 py-1 type-control"
							value={promptValue}
							placeholder={latestPrompt.placeholder}
							onChange={(e) => setPromptValue(e.target.value)}
						/>
						<button
							type="button"
							className="rounded surface-accent-soft px-2 py-1 hover:opacity-80 type-control"
							onClick={() => {
								respond.mutate({
									loginId: latestPrompt.loginId,
									promptId: latestPrompt.promptId,
									value: promptValue,
								});
								setPromptValue("");
							}}
						>
							Submit
						</button>
					</div>
				) : null}

				{latestPrompt?.type === "oauth.select" && !result ? (
					<div className="flex flex-col gap-2 rounded border border-border/40 p-2 type-body">
						<div className="type-label">{latestPrompt.message}</div>
						{latestPrompt.options.map((option) => (
							<button
								key={option}
								type="button"
								className="surface-row rounded px-2 py-1 text-left hover:opacity-80 type-control"
								onClick={() =>
									respond.mutate({
										loginId: latestPrompt.loginId,
										promptId: latestPrompt.promptId,
										value: option,
									})
								}
							>
								{option}
							</button>
						))}
					</div>
				) : null}

				{result ? (
					<div>
						<button
							type="button"
							className="rounded px-2 py-1 hover:opacity-80 type-control"
							aria-expanded={detailsOpen}
							onClick={() => setDetailsOpen((open) => !open)}
						>
							Authentication details
						</button>
						{detailsOpen ? <OAuthEventHistory events={events} /> : null}
					</div>
				) : (
					<OAuthEventHistory events={events} />
				)}

				<div className="flex justify-end gap-2 border-t border-border/40 pt-3">
					{result?.kind === "success" ? (
						<button
							type="button"
							className="rounded surface-accent px-3 py-1 hover:opacity-90 type-control"
							onClick={onClose}
						>
							Done
						</button>
					) : result?.kind === "error" ? (
						<>
							<button
								type="button"
								className="rounded px-3 py-1 hover:opacity-80 type-control"
								onClick={onClose}
							>
								Close
							</button>
							<button
								type="button"
								className="rounded surface-accent px-3 py-1 hover:opacity-90 disabled:opacity-50 type-control"
								disabled={start.isPending}
								onClick={() => void startAttempt()}
							>
								Try again
							</button>
						</>
					) : (
						<button
							type="button"
							className="rounded px-2 py-1 hover:opacity-80 type-control"
							onClick={() => {
								if (loginId) cancel.mutate({ loginId });
								onClose();
							}}
						>
							Cancel
						</button>
					)}
				</div>
			</div>
		</div>
	);
}

function OAuthEventHistory({ events }: { events: OAuthEvent[] }) {
	return (
		<div className="rounded bg-black/20 p-2 type-code type-technical-wrap text-muted">
			{events.length === 0 ? <div>Starting login…</div> : null}
			{events.map((event) => (
				<div key={oauthEventKey(event)}>
					{event.type === "oauth.progress" ? event.message : event.type}
					{event.type === "oauth.error" ? `: ${event.message}` : ""}
				</div>
			))}
		</div>
	);
}

function appendOAuthEvent(
	events: OAuthEvent[],
	event: OAuthEvent,
): OAuthEvent[] {
	const key = oauthEventKey(event);
	if (events.some((existing) => oauthEventKey(existing) === key)) return events;
	return [...events, event];
}

function oauthEventKey(event: OAuthEvent): string {
	switch (event.type) {
		case "oauth.authUrl":
			return `${event.type}:${event.loginId}:${event.url}`;
		case "oauth.deviceCode":
			return `${event.type}:${event.loginId}:${event.code}`;
		case "oauth.prompt":
		case "oauth.select":
			return `${event.type}:${event.loginId}:${event.promptId}`;
		case "oauth.progress":
		case "oauth.error":
			return `${event.type}:${event.loginId}:${event.message}`;
		case "oauth.success":
		case "oauth.cancelled":
			return `${event.type}:${event.loginId}`;
	}
}
