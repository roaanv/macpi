import React from "react";
import type { OAuthEvent } from "../../shared/model-auth-types";
import { invoke, onOAuthEvent } from "../ipc";
import {
	useCancelOAuthLogin,
	useRespondOAuthPrompt,
	useStartOAuthLogin,
} from "../queries";

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

	React.useEffect(() => {
		if (!provider) return;
		setEvents([]);
		setPromptValue("");
		void start.mutateAsync({ provider }).then((result) => setLoginId(result.loginId));
	}, [provider]);

	React.useEffect(() => {
		if (!loginId) return;
		return onOAuthEvent((event) => {
			if (event.loginId !== loginId) return;
			setEvents((prev) => [...prev, event]);
		});
	}, [loginId]);

	if (!provider) return null;
	const latestPrompt = [...events].reverse().find(
		(event) => event.type === "oauth.prompt" || event.type === "oauth.select",
	);
	const latestUrl = [...events].reverse().find(
		(event) => event.type === "oauth.authUrl",
	);
	const done = events.some(
		(event) => event.type === "oauth.success" || event.type === "oauth.error" || event.type === "oauth.cancelled",
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
			<div className="surface-panel flex max-h-[80vh] w-[560px] flex-col gap-3 overflow-auto rounded p-4 shadow-xl">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-base font-semibold">OAuth login</div>
						<div className="text-xs text-muted">{provider}</div>
					</div>
					<button type="button" className="rounded px-2 py-1 hover:opacity-80" onClick={onClose}>✕</button>
				</div>

				{start.error ? <div className="text-sm text-red-400">{start.error.message}</div> : null}
				{latestUrl?.type === "oauth.authUrl" ? (
					<div className="rounded border border-border/40 p-2 text-sm">
						{latestUrl.instructions ? <div className="mb-2 text-muted">{latestUrl.instructions}</div> : null}
						<div className="break-all text-xs text-muted">{latestUrl.url}</div>
						<button type="button" className="mt-2 rounded bg-blue-500/20 px-2 py-1 text-sm hover:opacity-80" onClick={() => void invoke("system.openExternalUrl", { url: latestUrl.url })}>
							Open Browser
						</button>
					</div>
				) : null}

				{latestPrompt?.type === "oauth.prompt" && !done ? (
					<div className="flex flex-col gap-2 rounded border border-border/40 p-2 text-sm">
						<label>{latestPrompt.message}</label>
						<input className="surface-row rounded px-2 py-1" value={promptValue} placeholder={latestPrompt.placeholder} onChange={(e) => setPromptValue(e.target.value)} />
						<button type="button" className="rounded bg-blue-500/20 px-2 py-1 hover:opacity-80" onClick={() => {
							respond.mutate({ loginId: latestPrompt.loginId, promptId: latestPrompt.promptId, value: promptValue });
							setPromptValue("");
						}}>
							Submit
						</button>
					</div>
				) : null}

				{latestPrompt?.type === "oauth.select" && !done ? (
					<div className="flex flex-col gap-2 rounded border border-border/40 p-2 text-sm">
						<div>{latestPrompt.message}</div>
						{latestPrompt.options.map((option) => (
							<button key={option} type="button" className="surface-row rounded px-2 py-1 text-left hover:opacity-80" onClick={() => respond.mutate({ loginId: latestPrompt.loginId, promptId: latestPrompt.promptId, value: option })}>
								{option}
							</button>
						))}
					</div>
				) : null}

				<div className="rounded bg-black/20 p-2 text-xs text-muted">
					{events.length === 0 ? <div>Starting login…</div> : null}
					{events.map((event, index) => (
						<div key={`${event.type}-${index}`}>
							{event.type === "oauth.progress" ? event.message : event.type}
							{event.type === "oauth.error" ? `: ${event.message}` : ""}
						</div>
					))}
				</div>

				<div className="flex justify-end gap-2">
					<button type="button" className="rounded px-2 py-1 text-sm hover:opacity-80" onClick={() => {
						if (loginId && !done) cancel.mutate({ loginId });
						onClose();
					}}>
						{done ? "Close" : "Cancel"}
					</button>
				</div>
			</div>
		</div>
	);
}
