import React from "react";
import type {
	CustomOpenAIModelCandidate,
	ModelSummary,
} from "../../shared/model-auth-types";
import {
	useListCustomOpenAIModels,
	useLogoutProvider,
	useModelAuthModels,
	useModelAuthProviders,
	useSaveApiKey,
	useSaveCustomOpenAIProvider,
} from "../queries";
import {
	buildProviderViews,
	filterProviderViews,
	type ProviderFilter,
	type ProviderView,
} from "../utils/model-provider-view";
import { ImportPiAuthModels } from "./ImportPiAuthModels";
import { ModelsJsonEditor } from "./ModelsJsonEditor";
import { OAuthLoginDialog } from "./OAuthLoginDialog";

const FILTERS: Array<{ id: ProviderFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "configured", label: "Configured" },
	{ id: "cloud", label: "Cloud" },
	{ id: "custom", label: "Custom" },
];

export function ProvidersSettings() {
	const providers = useModelAuthProviders();
	const models = useModelAuthModels();
	const saveApiKey = useSaveApiKey();
	const logout = useLogoutProvider();
	const [oauthProvider, setOAuthProvider] = React.useState<string | null>(null);
	const [selectedProviderId, setSelectedProviderId] = React.useState<
		string | null
	>(null);
	const [query, setQuery] = React.useState("");
	const [filter, setFilter] = React.useState<ProviderFilter>("all");
	const [editingProvider, setEditingProvider] = React.useState<string | null>(
		null,
	);
	const [apiKey, setApiKey] = React.useState("");
	const [keychainService, setKeychainService] = React.useState("");
	const [credentialMode, setCredentialMode] = React.useState<
		"apiKey" | "keychainService"
	>("apiKey");
	const [showAdvanced, setShowAdvanced] = React.useState(false);
	const [showImport, setShowImport] = React.useState(false);
	const [addingCustom, setAddingCustom] = React.useState(false);

	const providerViews = React.useMemo(
		() =>
			buildProviderViews(
				providers.data?.providers ?? [],
				models.data?.models ?? [],
			),
		[providers.data?.providers, models.data?.models],
	);
	const filteredProviders = React.useMemo(
		() => filterProviderViews(providerViews, filter, query),
		[providerViews, filter, query],
	);
	const activeProvider =
		filteredProviders.find((provider) => provider.id === selectedProviderId) ??
		filteredProviders[0] ??
		null;

	React.useEffect(() => {
		if (!activeProvider) return;
		if (selectedProviderId === activeProvider.id) return;
		setSelectedProviderId(activeProvider.id);
	}, [activeProvider, selectedProviderId]);

	return (
		<div className="-m-6 flex h-full flex-col overflow-hidden text-primary">
			<OAuthLoginDialog
				provider={oauthProvider}
				onClose={() => setOAuthProvider(null)}
			/>
			<SettingsOverlay
				open={showAdvanced}
				title="Advanced models.json"
				onClose={() => setShowAdvanced(false)}
			>
				<ModelsJsonEditor />
			</SettingsOverlay>
			<SettingsOverlay
				open={showImport}
				title="Import from pi"
				onClose={() => setShowImport(false)}
			>
				<ImportPiAuthModels />
			</SettingsOverlay>

			<header className="flex items-start justify-between gap-4 border-b border-divider px-5 py-4">
				<div>
					<h2 className="type-view-title">Providers</h2>
					<div className="mt-1 type-metadata text-muted">
						Configure provider authentication and custom endpoints.
					</div>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<button
						type="button"
						onClick={() => setShowAdvanced(true)}
						className="rounded px-3 py-2 type-control text-muted hover:surface-row hover:text-primary"
					>
						Advanced
					</button>
					<button
						type="button"
						onClick={() => setShowImport(true)}
						className="rounded px-3 py-2 type-control text-muted hover:surface-row hover:text-primary"
					>
						↓ Import from pi…
					</button>
				</div>
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_1fr] overflow-hidden">
				<aside className="flex min-h-0 flex-col border-r border-divider">
					<div className="flex gap-2 border-b border-divider p-3">
						<input
							type="search"
							aria-label="Search providers"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search providers…"
							className="surface-row min-w-0 flex-1 rounded px-3 py-2 type-control outline-none"
						/>
						<label className="sr-only type-label" htmlFor="provider-filter">
							Filter providers
						</label>
						<select
							id="provider-filter"
							value={filter}
							onChange={(event) =>
								setFilter(event.target.value as ProviderFilter)
							}
							className="surface-row rounded px-2 py-2 type-control outline-none"
						>
							{FILTERS.map((item) => (
								<option key={item.id} value={item.id}>
									{item.label}
								</option>
							))}
						</select>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-3">
						<button
							type="button"
							onClick={() => {
								setAddingCustom(true);
								setFilter("custom");
							}}
							className={`mb-3 flex w-full items-center gap-3 rounded border border-dashed border-divider p-3 text-left type-control ${
								addingCustom
									? "surface-accent-soft text-primary"
									: "text-muted hover:surface-row"
							}`}
						>
							<span className="surface-row rounded px-3 py-2 text-xl">+</span>
							<span>Add custom OpenAI-compatible provider</span>
						</button>
						{providers.error ? (
							<div className="rounded surface-err-soft p-2 type-status type-technical-wrap text-err">
								{providers.error.message}
							</div>
						) : providers.isLoading ? (
							<div className="type-status text-muted">Loading providers…</div>
						) : filteredProviders.length === 0 ? (
							<div className="type-status text-muted">No providers match.</div>
						) : (
							<div className="flex flex-col gap-2">
								{filteredProviders.map((provider) => (
									<ProviderRow
										key={provider.id}
										provider={provider}
										selected={activeProvider?.id === provider.id}
										onClick={() => setSelectedProviderId(provider.id)}
									/>
								))}
							</div>
						)}
					</div>
				</aside>

				<main className="min-h-0 overflow-y-auto p-6">
					{models.error ? (
						<div
							className="mb-4 rounded surface-err-soft p-3 type-status text-err"
							role="alert"
						>
							Models could not be loaded: {models.error.message}
						</div>
					) : null}
					{models.data?.registryError ? (
						<div className="mb-4 rounded surface-warn-soft p-3 type-status type-technical-wrap text-warn">
							Model registry warning: {models.data.registryError}
						</div>
					) : null}
					{addingCustom ? (
						<CustomOpenAIProviderForm
							onCancel={() => setAddingCustom(false)}
							onSaved={(provider) => {
								setAddingCustom(false);
								setSelectedProviderId(provider);
							}}
						/>
					) : activeProvider ? (
						<ProviderDetail
							provider={activeProvider}
							modelInventoryUnavailable={!!models.error}
							onStartOAuth={setOAuthProvider}
							onStartApiKey={() => {
								setEditingProvider(activeProvider.id);
								setApiKey("");
								setKeychainService("");
								setCredentialMode("apiKey");
							}}
							onLogout={() => logout.mutate({ provider: activeProvider.id })}
							editingApiKey={editingProvider === activeProvider.id}
							apiKey={apiKey}
							keychainService={keychainService}
							credentialMode={credentialMode}
							onApiKeyChange={setApiKey}
							onKeychainServiceChange={setKeychainService}
							onCredentialModeChange={setCredentialMode}
							onCancelApiKey={() => {
								setEditingProvider(null);
								setApiKey("");
								setKeychainService("");
							}}
							onSaveApiKey={() =>
								saveApiKey.mutate(
									{
										provider: activeProvider.id,
										credential:
											credentialMode === "apiKey"
												? { mode: "apiKey", apiKey }
												: {
														mode: "keychainService",
														service: keychainService,
													},
									},
									{
										onSuccess: () => {
											setEditingProvider(null);
											setApiKey("");
										},
									},
								)
							}
							authError={saveApiKey.error?.message ?? logout.error?.message}
						/>
					) : (
						<div className="text-sm text-muted">
							No providers discovered yet.
						</div>
					)}
				</main>
			</div>
		</div>
	);
}

function CustomOpenAIProviderForm({
	onCancel,
	onSaved,
}: {
	onCancel: () => void;
	onSaved: (provider: string) => void;
}) {
	const listModels = useListCustomOpenAIModels();
	const saveProvider = useSaveCustomOpenAIProvider();
	const [name, setName] = React.useState("Custom OpenAI");
	const [providerId, setProviderId] = React.useState("custom-openai");
	const [baseUrl, setBaseUrl] = React.useState("http://localhost:11434/v1");
	const [apiKey, setApiKey] = React.useState("");
	const [keychainService, setKeychainService] = React.useState("");
	const [credentialMode, setCredentialMode] = React.useState<
		"apiKey" | "keychainService"
	>("apiKey");
	const [models, setModels] = React.useState<CustomOpenAIModelCandidate[]>([]);

	function discoverModels() {
		listModels.mutate(
			{ baseUrl, apiKey },
			{
				onSuccess: (data) => setModels(data.models),
			},
		);
	}

	function save() {
		saveProvider.mutate(
			{
				providerId,
				name,
				baseUrl,
				credential:
					credentialMode === "apiKey"
						? { mode: "apiKey", apiKey }
						: { mode: "keychainService", service: keychainService },
				models,
			},
			{
				onSuccess: (data) => onSaved(data.provider),
			},
		);
	}

	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-6">
			<section>
				<h3 className="type-section-heading">
					Add custom OpenAI-compatible provider
				</h3>
				<p className="mt-2 max-w-2xl type-metadata text-muted">
					Connect an OpenAI-compatible custom endpoint. Model discovery is
					optional; models can be fetched or added later under Models.
				</p>
			</section>

			<section className="rounded-xl border border-divider p-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex flex-col gap-1 type-label">
						<span className="text-muted">Display name</span>
						<input
							className="surface-row rounded px-3 py-2 outline-none type-control"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1 type-label">
						<span className="text-muted">Provider id</span>
						<input
							className="surface-row rounded px-3 py-2 type-code type-control type-technical-wrap outline-none"
							value={providerId}
							onChange={(e) => setProviderId(e.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1 sm:col-span-2 type-label">
						<span className="text-muted">Base URL</span>
						<input
							className="surface-row rounded px-3 py-2 type-code type-control type-technical-wrap outline-none"
							value={baseUrl}
							onChange={(e) => setBaseUrl(e.target.value)}
							placeholder="http://localhost:11434/v1"
						/>
					</label>
					<fieldset className="flex flex-col gap-2 text-sm sm:col-span-2">
						<legend className="type-label text-muted">Credential source</legend>
						<div className="flex gap-4">
							<label>
								<input
									type="radio"
									name="custom-provider-credential-source"
									checked={credentialMode === "apiKey"}
									onChange={() => setCredentialMode("apiKey")}
								/>{" "}
								Enter API key
							</label>
							<label>
								<input
									type="radio"
									name="custom-provider-credential-source"
									checked={credentialMode === "keychainService"}
									onChange={() => setCredentialMode("keychainService")}
								/>{" "}
								Use Keychain service
							</label>
						</div>
						{credentialMode === "apiKey" ? (
							<input
								aria-label="API key"
								type="password"
								autoComplete="off"
								className="surface-row rounded px-3 py-2 outline-none type-control"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
							/>
						) : (
							<input
								aria-label="Keychain service name"
								autoComplete="off"
								className="surface-row rounded px-3 py-2 outline-none type-control"
								value={keychainService}
								onChange={(e) => setKeychainService(e.target.value)}
							/>
						)}
					</fieldset>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<button
						type="button"
						className="rounded surface-accent-soft px-3 py-2 hover:opacity-80 disabled:opacity-50 type-control"
						disabled={
							listModels.isPending ||
							credentialMode !== "apiKey" ||
							!apiKey.trim()
						}
						onClick={discoverModels}
					>
						{listModels.isPending ? "Fetching models…" : "Fetch models"}
					</button>
					<button
						type="button"
						className="rounded px-3 py-2 hover:surface-row type-control"
						onClick={onCancel}
					>
						Cancel
					</button>
				</div>
				{listModels.error ? (
					<div className="mt-3 type-status type-technical-wrap text-err">
						{listModels.error.message}
					</div>
				) : null}
			</section>

			<section>
				<div className="mb-3 type-overline text-muted">
					Available models · {models.length}
				</div>
				{models.length === 0 ? (
					<div className="rounded-xl border border-divider p-4 type-status text-muted">
						No models yet. Save now, then fetch or add models under Models.
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border border-divider">
						{models.map((model) => (
							<div
								key={model.id}
								className="border-b border-divider px-3 py-2 last:border-b-0"
							>
								<div className="text-sm font-medium">{model.name}</div>
								<div className="type-code type-metadata text-muted">
									{model.id}
								</div>
							</div>
						))}
					</div>
				)}
				<div className="mt-4 flex justify-end">
					<button
						type="button"
						className="rounded surface-accent px-4 py-2 hover:opacity-90 disabled:opacity-50 type-control"
						disabled={
							saveProvider.isPending ||
							(credentialMode === "apiKey"
								? !apiKey.trim()
								: !keychainService.trim())
						}
						onClick={save}
					>
						{saveProvider.isPending ? "Saving…" : "Save provider"}
					</button>
				</div>
				{saveProvider.error ? (
					<div className="mt-3 type-status type-technical-wrap text-err">
						{saveProvider.error.message}
					</div>
				) : null}
			</section>
		</div>
	);
}

function ProviderRow({
	provider,
	selected,
	onClick,
}: {
	provider: ProviderView;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left ${
				selected
					? "border border-accent surface-accent-soft"
					: "hover:surface-row"
			}`}
		>
			<ProviderBadge provider={provider} />
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium">{provider.name}</div>
				<div className="truncate type-code type-metadata text-muted">
					{provider.id} · {provider.kind}
				</div>
			</div>
			<span
				className={`h-2.5 w-2.5 rounded-full ${
					provider.authStatus.configured
						? "surface-ok"
						: "bg-[var(--text-faint)]"
				}`}
			/>
		</button>
	);
}

function ProviderBadge({ provider }: { provider: ProviderView }) {
	return (
		<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded surface-row type-code text-xs font-semibold">
			{provider.initials}
		</div>
	);
}

function ProviderDetail({
	provider,
	modelInventoryUnavailable,
	onStartOAuth,
	onStartApiKey,
	onLogout,
	editingApiKey,
	apiKey,
	keychainService,
	credentialMode,
	onApiKeyChange,
	onKeychainServiceChange,
	onCredentialModeChange,
	onCancelApiKey,
	onSaveApiKey,
	authError,
}: {
	provider: ProviderView;
	modelInventoryUnavailable: boolean;
	onStartOAuth: (provider: string) => void;
	onStartApiKey: () => void;
	onLogout: () => void;
	editingApiKey: boolean;
	apiKey: string;
	keychainService: string;
	credentialMode: "apiKey" | "keychainService";
	onApiKeyChange: (value: string) => void;
	onKeychainServiceChange: (value: string) => void;
	onCredentialModeChange: (value: "apiKey" | "keychainService") => void;
	onCancelApiKey: () => void;
	onSaveApiKey: () => void;
	authError?: string;
}) {
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-5">
			<section className="flex items-start gap-3">
				<ProviderBadge provider={provider} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="type-section-heading">{provider.name}</h3>
						<span className="rounded-full surface-row px-2 py-0.5 type-metadata text-muted">
							{provider.authStatus.configured ? "Configured" : "Not configured"}
						</span>
					</div>
					<div className="mt-2 type-code type-technical-wrap text-muted">
						{provider.id} · {provider.kind}
					</div>
					<p className="mt-2 max-w-2xl type-metadata text-muted">
						{provider.kind === "cloud"
							? "Built-in MacPi provider. Configure authentication to make its models available."
							: "OpenAI-compatible custom provider endpoint."}
					</p>
				</div>
			</section>

			<section>
				<div className="mb-3 flex items-center justify-between type-overline text-muted">
					<span>Authentication</span>
					<span>{authLabel(provider)}</span>
				</div>
				<div className="rounded-xl border border-divider p-4">
					<div className="text-sm text-primary">{authHelp(provider)}</div>
					<div className="mt-4 flex flex-wrap gap-2 text-sm">
						{provider.supportsOAuth ? (
							<button
								type="button"
								onClick={() => onStartOAuth(provider.id)}
								className="rounded surface-accent px-3 py-2 hover:opacity-90"
							>
								↗ Sign in with {provider.name}
							</button>
						) : null}
						{provider.supportsStoredApiKey ? (
							<button
								type="button"
								onClick={onStartApiKey}
								className="rounded surface-accent-soft px-3 py-2 hover:opacity-80 type-control"
							>
								Add / replace API key
							</button>
						) : null}
						{provider.authStatus.configured ? (
							<button
								type="button"
								onClick={onLogout}
								className="rounded surface-err-soft px-3 py-2 text-err hover:opacity-80 type-control"
							>
								Remove auth
							</button>
						) : null}
					</div>
					{editingApiKey ? (
						<div className="mt-4 flex flex-wrap gap-2">
							<div
								role="radiogroup"
								aria-label={`Credential source for ${provider.name}`}
								className="flex w-full gap-4 text-sm"
							>
								<label>
									<input
										type="radio"
										name={`provider-credential-source-${provider.id}`}
										checked={credentialMode === "apiKey"}
										onChange={() => onCredentialModeChange("apiKey")}
									/>{" "}
									Enter API key
								</label>
								<label>
									<input
										type="radio"
										name={`provider-credential-source-${provider.id}`}
										checked={credentialMode === "keychainService"}
										onChange={() => onCredentialModeChange("keychainService")}
									/>{" "}
									Use Keychain service
								</label>
							</div>
							{credentialMode === "apiKey" ? (
								<input
									type="password"
									autoComplete="off"
									aria-label={`API key for ${provider.name}`}
									value={apiKey}
									onChange={(e) => onApiKeyChange(e.target.value)}
									placeholder="API key"
									className="surface-row min-w-64 flex-1 rounded px-3 py-2 type-control outline-none"
								/>
							) : (
								<input
									aria-label={`Keychain service for ${provider.name}`}
									autoComplete="off"
									value={keychainService}
									onChange={(e) => onKeychainServiceChange(e.target.value)}
									placeholder="Keychain service name"
									className="surface-row min-w-64 flex-1 rounded px-3 py-2 type-control outline-none"
								/>
							)}
							<button
								type="button"
								className="rounded surface-accent-soft px-3 py-2 type-control"
								onClick={onSaveApiKey}
							>
								Save
							</button>
							<button
								type="button"
								className="rounded px-3 py-2 hover:surface-row type-control"
								onClick={onCancelApiKey}
							>
								Cancel
							</button>
						</div>
					) : null}
					{authError ? (
						<div className="mt-3 type-status type-technical-wrap text-err">
							{authError}
						</div>
					) : null}
				</div>
			</section>

			<section>
				{modelInventoryUnavailable ? (
					<div className="rounded border border-divider p-3 text-sm text-muted">
						Model inventory unavailable.
					</div>
				) : (
					<details className="rounded border border-divider">
						<summary className="cursor-pointer px-3 py-2 text-muted type-control">
							{provider.models.length} models available
						</summary>
						<ReadOnlyModelInventory models={provider.models} />
					</details>
				)}
			</section>
		</div>
	);
}

function ReadOnlyModelInventory({ models }: { models: ModelSummary[] }) {
	if (models.length === 0) {
		return (
			<div className="border-t border-divider px-3 py-2 text-sm text-muted">
				No models discovered for this provider.
			</div>
		);
	}
	return (
		<div className="border-t border-divider">
			{models.map((model) => (
				<div
					key={`${model.provider}/${model.id}`}
					className="border-b border-divider px-3 py-2 last:border-b-0"
				>
					<div className="truncate text-sm font-medium">{model.name}</div>
					<div className="truncate type-code type-metadata text-muted">
						{model.id}
					</div>
				</div>
			))}
		</div>
	);
}

function SettingsOverlay({
	open,
	title,
	onClose,
	children,
}: {
	open: boolean;
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	if (!open) return null;
	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
			<button
				type="button"
				className="absolute inset-0 cursor-default type-control"
				aria-label={`Close ${title}`}
				onClick={onClose}
			/>
			<div
				className="surface-panel relative max-h-[75vh] w-[720px] overflow-y-auto rounded-xl p-4 shadow-xl"
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<div className="mb-4 flex items-center justify-between gap-4">
					<h3 className="type-section-heading">{title}</h3>
					<button
						type="button"
						className="rounded px-2 py-1 hover:surface-row type-control"
						onClick={onClose}
					>
						Close
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

function authLabel(provider: ProviderView): string {
	if (provider.supportsOAuth) return "OAuth required";
	if (provider.supportsStoredApiKey) return "API key";
	return provider.authType;
}

function authHelp(provider: ProviderView): string {
	if (provider.supportsOAuth) {
		return `Sign in with the account that has access to ${provider.name}. Your subscription quota may be used.`;
	}
	if (provider.supportsStoredApiKey) {
		return `Store an API key for ${provider.name} in macOS Keychain, or reference an existing Keychain service.`;
	}
	return "This provider does not expose a configurable auth flow.";
}
