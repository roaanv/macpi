import React from "react";
import type { LocalOpenAIModelCandidate, ModelSummary } from "../../shared/model-auth-types";
import {
	useListLocalOpenAIModels,
	useLogoutProvider,
	useModelAuthModels,
	useModelAuthProviders,
	useSaveApiKey,
	useSaveLocalOpenAIProvider,
	useSelectedModel,
	useSetSelectedModel,
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
	{ id: "local", label: "Local" },
];

export function ModelsAuthSettings() {
	const providers = useModelAuthProviders();
	const models = useModelAuthModels();
	const selected = useSelectedModel();
	const setSelected = useSetSelectedModel();
	const saveApiKey = useSaveApiKey();
	const logout = useLogoutProvider();
	const [oauthProvider, setOAuthProvider] = React.useState<string | null>(null);
	const [selectedProviderId, setSelectedProviderId] = React.useState<string | null>(null);
	const [query, setQuery] = React.useState("");
	const [filter, setFilter] = React.useState<ProviderFilter>("all");
	const [editingProvider, setEditingProvider] = React.useState<string | null>(null);
	const [apiKey, setApiKey] = React.useState("");
	const [showAdvanced, setShowAdvanced] = React.useState(false);
	const [showImport, setShowImport] = React.useState(false);
	const [addingLocal, setAddingLocal] = React.useState(false);

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
		providerViews.find((provider) => provider.id === selectedProviderId) ??
		providerViews.find(
			(provider) => provider.id === selected.data?.model?.provider,
		) ??
		filteredProviders[0] ??
		providerViews[0] ??
		null;

	React.useEffect(() => {
		if (!activeProvider) return;
		if (selectedProviderId === activeProvider.id) return;
		setSelectedProviderId(activeProvider.id);
	}, [activeProvider, selectedProviderId]);

	const selectedLabel = selected.data?.model
		? `${selected.data.model.provider} / ${selected.data.model.modelId}`
		: "No model selected";

	return (
		<div className="-m-6 flex h-full flex-col overflow-hidden text-primary">
			<OAuthLoginDialog
				provider={oauthProvider}
				onClose={() => setOAuthProvider(null)}
			/>
			<SettingsOverlay open={showAdvanced} title="Advanced models.json" onClose={() => setShowAdvanced(false)}>
				<ModelsJsonEditor />
			</SettingsOverlay>
			<SettingsOverlay open={showImport} title="Import from pi" onClose={() => setShowImport(false)}>
				<ImportPiAuthModels />
			</SettingsOverlay>

			<header className="flex items-start justify-between gap-4 border-b border-divider px-6 py-5">
				<div>
					<h2 className="text-xl font-semibold">Models &amp; Auth</h2>
					<div className="mt-1 text-sm text-muted">
						Configure where MacPi sends your messages.
					</div>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<button
						type="button"
						onClick={() => setShowAdvanced(true)}
						className="rounded px-3 py-2 text-muted hover:surface-row hover:text-primary"
					>
						Advanced
					</button>
					<button
						type="button"
						onClick={() => setShowImport(true)}
						className="rounded px-3 py-2 text-muted hover:surface-row hover:text-primary"
					>
						↓ Import from pi…
					</button>
				</div>
			</header>

			<div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,360px)_1fr] overflow-hidden">
				<aside className="flex min-h-0 flex-col border-r border-divider">
					<div className="border-b border-divider p-4">
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search providers…"
							className="surface-row w-full rounded px-3 py-2 text-sm outline-none"
						/>
					</div>
					<div className="flex gap-1 border-b border-divider px-4 py-3 text-sm">
						{FILTERS.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setFilter(item.id)}
								className={`rounded-full px-3 py-1 ${
									filter === item.id
										? "bg-blue-500/20 text-blue-300"
										: "text-muted hover:surface-row"
								}`}
							>
								{item.label}
							</button>
						))}
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-3">
						<button
							type="button"
							onClick={() => {
								setAddingLocal(true);
								setFilter("local");
							}}
							className={`mb-3 flex w-full items-center gap-3 rounded border border-dashed border-divider p-3 text-left text-sm ${
								addingLocal ? "bg-blue-500/10 text-primary" : "text-muted hover:surface-row"
							}`}
						>
							<span className="surface-row rounded px-3 py-2 text-xl">+</span>
							<span>Add local OpenAI-compatible provider</span>
						</button>
						{providers.error ? (
							<div className="rounded bg-red-500/10 p-2 text-sm text-red-300">
								{providers.error.message}
							</div>
						) : providers.isLoading ? (
							<div className="text-sm text-muted">Loading providers…</div>
						) : filteredProviders.length === 0 ? (
							<div className="text-sm text-muted">No providers match.</div>
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
					{models.data?.registryError ? (
						<div className="mb-4 rounded bg-yellow-500/10 p-3 text-sm text-yellow-300">
							{models.data.registryError}
						</div>
					) : null}
					{selected.error ? (
						<div className="mb-4 rounded bg-red-500/10 p-3 text-sm text-red-300">
							{selected.error.message}
						</div>
					) : null}
					{addingLocal ? (
						<LocalOpenAIProviderForm
							onCancel={() => setAddingLocal(false)}
							onSaved={(provider) => {
								setAddingLocal(false);
								setSelectedProviderId(provider);
							}}
						/>
					) : activeProvider ? (
						<ProviderDetail
							provider={activeProvider}
							selectedModel={selected.data?.model ?? null}
							selectedValid={selected.data?.valid ?? true}
							selectedError={selected.data?.error}
							onSelectModel={(model) => setSelected.mutate({ model })}
							onStartOAuth={setOAuthProvider}
							onStartApiKey={() => {
								setEditingProvider(activeProvider.id);
								setApiKey("");
							}}
							onLogout={() => logout.mutate({ provider: activeProvider.id })}
							editingApiKey={editingProvider === activeProvider.id}
							apiKey={apiKey}
							onApiKeyChange={setApiKey}
							onCancelApiKey={() => {
								setEditingProvider(null);
								setApiKey("");
							}}
							onSaveApiKey={() =>
								saveApiKey.mutate(
									{ provider: activeProvider.id, apiKey },
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
						<div className="text-sm text-muted">No providers discovered yet.</div>
					)}
				</main>
			</div>

			<footer className="flex items-center justify-between border-t border-divider px-6 py-4 text-sm">
				<div className="text-muted">
					Active: <span className="font-mono text-primary">{selectedLabel}</span>
					{selected.data && !selected.data.valid ? (
						<span className="ml-2 text-red-400">{selected.data.error}</span>
					) : null}
				</div>
			</footer>
		</div>
	);
}

function LocalOpenAIProviderForm({
	onCancel,
	onSaved,
}: {
	onCancel: () => void;
	onSaved: (provider: string) => void;
}) {
	const listModels = useListLocalOpenAIModels();
	const saveProvider = useSaveLocalOpenAIProvider();
	const [name, setName] = React.useState("Local OpenAI");
	const [providerId, setProviderId] = React.useState("local-openai");
	const [baseUrl, setBaseUrl] = React.useState("http://localhost:11434/v1");
	const [apiKey, setApiKey] = React.useState("ollama");
	const [models, setModels] = React.useState<LocalOpenAIModelCandidate[]>([]);
	const [selectedModelId, setSelectedModelId] = React.useState("");

	function discoverModels() {
		listModels.mutate(
			{ baseUrl, apiKey },
			{
				onSuccess: (data) => {
					setModels(data.models);
					setSelectedModelId(data.models[0]?.id ?? "");
				},
			},
		);
	}

	function save() {
		saveProvider.mutate(
			{ providerId, name, baseUrl, apiKey, models, selectedModelId },
			{
				onSuccess: (data) => onSaved(data.provider),
			},
		);
	}

	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-6">
			<section>
				<h3 className="text-xl font-semibold">Add local OpenAI-compatible provider</h3>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
					Connect Ollama, LM Studio, vLLM, or a local proxy that exposes the OpenAI-compatible <span className="font-mono">/models</span> endpoint.
				</p>
			</section>

			<section className="rounded-xl border border-divider p-4">
				<div className="grid gap-3 sm:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted">Display name</span>
						<input className="surface-row rounded px-3 py-2 outline-none" value={name} onChange={(e) => setName(e.target.value)} />
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted">Provider id</span>
						<input className="surface-row rounded px-3 py-2 font-mono outline-none" value={providerId} onChange={(e) => setProviderId(e.target.value)} />
					</label>
					<label className="flex flex-col gap-1 text-sm sm:col-span-2">
						<span className="text-muted">Base URL</span>
						<input className="surface-row rounded px-3 py-2 font-mono outline-none" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
					</label>
					<label className="flex flex-col gap-1 text-sm sm:col-span-2">
						<span className="text-muted">API key</span>
						<input type="password" className="surface-row rounded px-3 py-2 outline-none" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="ollama" />
					</label>
				</div>
				<div className="mt-4 flex flex-wrap gap-2">
					<button type="button" className="rounded bg-blue-500/20 px-3 py-2 text-sm hover:opacity-80 disabled:opacity-50" disabled={listModels.isPending} onClick={discoverModels}>
						{listModels.isPending ? "Fetching models…" : "Fetch models"}
					</button>
					<button type="button" className="rounded px-3 py-2 text-sm hover:surface-row" onClick={onCancel}>
						Cancel
					</button>
				</div>
				{listModels.error ? <div className="mt-3 text-sm text-red-400">{listModels.error.message}</div> : null}
			</section>

			<section>
				<div className="mb-3 text-xs uppercase tracking-widest text-muted">
					Available models · {models.length}
				</div>
				{models.length === 0 ? (
					<div className="rounded-xl border border-divider p-4 text-sm text-muted">
						Fetch models from the provider, then choose the model MacPi should use.
					</div>
				) : (
					<div className="overflow-hidden rounded-xl border border-divider">
						{models.map((model) => (
							<button
								type="button"
								key={model.id}
								onClick={() => setSelectedModelId(model.id)}
								className="flex w-full items-center gap-4 border-b border-divider p-4 text-left last:border-b-0 hover:surface-row"
							>
								<span className={`flex h-7 w-7 items-center justify-center rounded ${selectedModelId === model.id ? "bg-blue-400 text-black" : "surface-row text-muted"}`}>
									{selectedModelId === model.id ? "✓" : ""}
								</span>
								<span>
									<span className="font-medium">{model.name}</span>
									<span className="block font-mono text-xs text-muted">{model.id}</span>
								</span>
							</button>
						))}
					</div>
				)}
				<div className="mt-4 flex justify-end">
					<button
						type="button"
						className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
						disabled={!selectedModelId || saveProvider.isPending}
						onClick={save}
					>
						{saveProvider.isPending ? "Saving…" : "Save provider and set default"}
					</button>
				</div>
				{saveProvider.error ? <div className="mt-3 text-sm text-red-400">{saveProvider.error.message}</div> : null}
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
			className={`flex w-full items-center gap-3 rounded p-3 text-left ${
				selected
					? "border border-blue-500/50 bg-blue-500/10"
					: "hover:surface-row"
			}`}
		>
			<ProviderBadge provider={provider} />
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium">{provider.name}</div>
				<div className="truncate font-mono text-xs text-muted">
					{provider.id} · {provider.kind} · {provider.modelCount} model
					{provider.modelCount === 1 ? "" : "s"}
				</div>
			</div>
			<span
				className={`h-2.5 w-2.5 rounded-full ${
					provider.authStatus.configured ? "bg-green-400" : "bg-slate-500"
				}`}
			/>
		</button>
	);
}

function ProviderBadge({ provider }: { provider: ProviderView }) {
	return (
		<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl surface-row font-mono text-sm font-semibold">
			{provider.initials}
		</div>
	);
}

function ProviderDetail({
	provider,
	selectedModel,
	selectedValid,
	selectedError,
	onSelectModel,
	onStartOAuth,
	onStartApiKey,
	onLogout,
	editingApiKey,
	apiKey,
	onApiKeyChange,
	onCancelApiKey,
	onSaveApiKey,
	authError,
}: {
	provider: ProviderView;
	selectedModel: { provider: string; modelId: string } | null;
	selectedValid: boolean;
	selectedError?: string;
	onSelectModel: (model: { provider: string; modelId: string }) => void;
	onStartOAuth: (provider: string) => void;
	onStartApiKey: () => void;
	onLogout: () => void;
	editingApiKey: boolean;
	apiKey: string;
	onApiKeyChange: (value: string) => void;
	onCancelApiKey: () => void;
	onSaveApiKey: () => void;
	authError?: string;
}) {
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-6">
			<section className="flex items-start gap-4">
				<ProviderBadge provider={provider} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-xl font-semibold">{provider.name}</h3>
						<span className="rounded-full surface-row px-2 py-0.5 text-xs text-muted">
							{provider.authStatus.configured ? "Configured" : "Not configured"}
						</span>
					</div>
					<div className="mt-2 font-mono text-sm text-muted">
						{provider.id} · {provider.kind}
					</div>
					<p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
						{provider.kind === "cloud"
							? "Built-in MacPi provider. Configure authentication, then choose which model sessions should use."
							: "OpenAI-compatible local provider. Configure the endpoint and choose an available model."}
					</p>
				</div>
			</section>

			<section>
				<div className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-muted">
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
								className="rounded bg-blue-500 px-3 py-2 text-white hover:opacity-90"
							>
								↗ Sign in with {provider.name}
							</button>
						) : null}
						{provider.supportsStoredApiKey ? (
							<button
								type="button"
								onClick={onStartApiKey}
								className="rounded bg-blue-500/20 px-3 py-2 hover:opacity-80"
							>
								Add / replace API key
							</button>
						) : null}
						{provider.authStatus.configured ? (
							<button
								type="button"
								onClick={onLogout}
								className="rounded bg-red-500/20 px-3 py-2 text-red-200 hover:opacity-80"
							>
								Remove auth
							</button>
						) : null}
					</div>
					{editingApiKey ? (
						<div className="mt-4 flex gap-2">
							<input
								type="password"
								value={apiKey}
								onChange={(e) => onApiKeyChange(e.target.value)}
								placeholder="API key"
								className="surface-row flex-1 rounded px-3 py-2 text-sm outline-none"
							/>
							<button type="button" className="rounded bg-blue-500/20 px-3 py-2 text-sm" onClick={onSaveApiKey}>
								Save
							</button>
							<button type="button" className="rounded px-3 py-2 text-sm hover:surface-row" onClick={onCancelApiKey}>
								Cancel
							</button>
						</div>
					) : null}
					{authError ? <div className="mt-3 text-sm text-red-400">{authError}</div> : null}
				</div>
			</section>

			<section>
				<div className="mb-3 text-xs uppercase tracking-widest text-muted">
					Models · {provider.models.length}
				</div>
				{selectedError && !selectedValid ? (
					<div className="mb-3 rounded bg-red-500/10 p-3 text-sm text-red-300">
						{selectedError}
					</div>
				) : null}
				<ModelList
					models={provider.models}
					selectedModel={selectedModel}
					onSelectModel={onSelectModel}
				/>
			</section>
		</div>
	);
}

function ModelList({
	models,
	selectedModel,
	onSelectModel,
}: {
	models: ModelSummary[];
	selectedModel: { provider: string; modelId: string } | null;
	onSelectModel: (model: { provider: string; modelId: string }) => void;
}) {
	if (models.length === 0) {
		return <div className="rounded-xl border border-divider p-4 text-sm text-muted">No models discovered for this provider.</div>;
	}
	return (
		<div className="overflow-hidden rounded-xl border border-divider">
			{models.map((model) => {
				const isSelected =
					selectedModel?.provider === model.provider &&
					selectedModel.modelId === model.id;
				return (
					<button
						type="button"
						key={`${model.provider}/${model.id}`}
						disabled={!model.authConfigured}
						onClick={() => onSelectModel({ provider: model.provider, modelId: model.id })}
						className="flex w-full items-center gap-4 border-b border-divider p-4 text-left last:border-b-0 hover:surface-row disabled:opacity-60"
					>
						<span className={`flex h-7 w-7 items-center justify-center rounded ${isSelected ? "bg-blue-400 text-black" : "surface-row text-muted"}`}>
							{isSelected ? "✓" : ""}
						</span>
						<span className="min-w-0 flex-1">
							<span className="flex flex-wrap items-center gap-2 font-medium">
								{model.name}
								{model.reasoning ? <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">reasoning</span> : null}
							</span>
							<span className="block truncate font-mono text-xs text-muted">{model.id}</span>
						</span>
						<span className="font-mono text-sm text-muted">{formatContext(model.contextWindow)}</span>
						<span className="text-sm text-muted">{model.authConfigured ? "Set default" : "Configure auth first"}</span>
					</button>
				);
			})}
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
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" role="presentation" onClick={onClose}>
			<div className="surface-panel max-h-[75vh] w-[720px] overflow-y-auto rounded-xl p-4 shadow-xl" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
				<div className="mb-4 flex items-center justify-between gap-4">
					<h3 className="text-lg font-semibold">{title}</h3>
					<button type="button" className="rounded px-2 py-1 text-sm hover:surface-row" onClick={onClose}>
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
		return `Store an API key for ${provider.name}. MacPi stores secrets in auth.json, not in chat history.`;
	}
	return "This provider does not expose a configurable auth flow.";
}

function formatContext(contextWindow: number): string {
	if (!contextWindow) return "—";
	if (contextWindow >= 1000) return `${Math.round(contextWindow / 1000)}K`;
	return String(contextWindow);
}
