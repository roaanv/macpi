import React from "react";
import type { ProviderSummary } from "../../shared/model-auth-types";
import { useLogoutProvider, useSaveApiKey } from "../queries";

interface ProviderAuthListProps {
	providers: ProviderSummary[];
	loading?: boolean;
	onStartOAuth?: (provider: string) => void;
}

export function ProviderAuthList({
	providers,
	loading,
	onStartOAuth,
}: ProviderAuthListProps) {
	const saveApiKey = useSaveApiKey();
	const logout = useLogoutProvider();
	const [editingProvider, setEditingProvider] = React.useState<string | null>(null);
	const [apiKey, setApiKey] = React.useState("");

	if (loading) {
		return <div className="text-sm text-muted">Loading providers…</div>;
	}
	if (providers.length === 0) {
		return <div className="text-sm text-muted">No providers discovered yet.</div>;
	}
	return (
		<div className="flex flex-col gap-2">
			{providers.map((provider) => (
				<div key={provider.id} className="surface-row rounded p-2 text-sm">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="font-medium">{provider.name}</div>
							<div className="text-xs text-muted">{provider.id}</div>
						</div>
						<div className="text-right text-xs">
							<div className={provider.authStatus.configured ? "text-green-400" : "text-yellow-400"}>
								{provider.authStatus.configured ? "Configured" : "Not configured"}
							</div>
							<div className="text-muted">{provider.authStatus.label ?? provider.authStatus.source ?? provider.authType}</div>
						</div>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
						<span>{provider.modelCount} model(s)</span>
						<span>{provider.availableModelCount} authenticated</span>
						{provider.supportsOAuth ? <span>OAuth</span> : null}
						{provider.supportsStoredApiKey ? <span>API key</span> : null}
					</div>
					<div className="mt-2 flex flex-wrap gap-2 text-xs">
						{provider.supportsStoredApiKey ? (
							<button type="button" className="rounded bg-blue-500/20 px-2 py-1 hover:opacity-80" onClick={() => { setEditingProvider(provider.id); setApiKey(""); }}>
								Add / replace key
							</button>
						) : null}
						{provider.supportsOAuth ? (
							<button type="button" className="rounded bg-blue-500/20 px-2 py-1 hover:opacity-80" onClick={() => onStartOAuth?.(provider.id)}>
								Sign in
							</button>
						) : null}
						{provider.authStatus.configured ? (
							<button type="button" className="rounded bg-red-500/20 px-2 py-1 hover:opacity-80" onClick={() => logout.mutate({ provider: provider.id })}>
								Remove stored key / sign out
							</button>
						) : null}
					</div>
					{editingProvider === provider.id ? (
						<div className="mt-2 flex gap-2">
							<input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" className="surface-row flex-1 rounded px-2 py-1 text-xs" />
							<button type="button" className="rounded bg-blue-500/20 px-2 py-1 text-xs hover:opacity-80" onClick={() => {
								saveApiKey.mutate({ provider: provider.id, apiKey }, { onSuccess: () => { setApiKey(""); setEditingProvider(null); } });
							}}>
								Save
							</button>
							<button type="button" className="rounded px-2 py-1 text-xs hover:opacity-80" onClick={() => { setApiKey(""); setEditingProvider(null); }}>
								Cancel
							</button>
						</div>
					) : null}
				</div>
			))}
			{saveApiKey.error ? <div className="text-xs text-red-400">{saveApiKey.error.message}</div> : null}
			{logout.error ? <div className="text-xs text-red-400">{logout.error.message}</div> : null}
		</div>
	);
}
