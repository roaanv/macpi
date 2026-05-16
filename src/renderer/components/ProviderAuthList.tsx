import type { ProviderSummary } from "../../shared/model-auth-types";

interface ProviderAuthListProps {
	providers: ProviderSummary[];
	loading?: boolean;
}

export function ProviderAuthList({ providers, loading }: ProviderAuthListProps) {
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
							<div
								className={
									provider.authStatus.configured
										? "text-green-400"
										: "text-yellow-400"
								}
							>
								{provider.authStatus.configured ? "Configured" : "Not configured"}
							</div>
							<div className="text-muted">
								{provider.authStatus.label ?? provider.authStatus.source ?? provider.authType}
							</div>
						</div>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
						<span>{provider.modelCount} model(s)</span>
						<span>{provider.availableModelCount} authenticated</span>
						{provider.supportsOAuth ? <span>OAuth</span> : null}
						{provider.supportsStoredApiKey ? <span>API key</span> : null}
					</div>
				</div>
			))}
		</div>
	);
}
