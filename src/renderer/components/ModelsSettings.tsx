import React from "react";
import {
	type FavouriteModelSetting,
	getFavouriteModels,
	modelRefKey,
} from "../../shared/app-settings-keys";
import type { ModelSummary } from "../../shared/model-auth-types";
import {
	useFetchCustomProviderModels,
	useModelAuthModels,
	useModelAuthProviders,
	useRemoveCustomModel,
	useSaveCustomModel,
	useSetSetting,
	useSettings,
} from "../queries";
import {
	buildProviderViews,
	configuredProviderViews,
	filterModels,
	type ProviderView,
} from "../utils/model-provider-view";

export function ModelsSettings() {
	const providers = useModelAuthProviders();
	const models = useModelAuthModels();
	const settings = useSettings();
	const setSetting = useSetSetting();
	const fetchCustomModels = useFetchCustomProviderModels();
	const saveCustomModel = useSaveCustomModel();
	const removeCustomModel = useRemoveCustomModel();
	const [selectedProviderId, setSelectedProviderId] = React.useState<
		string | null
	>(null);
	const [query, setQuery] = React.useState("");
	const [favouritesOpen, setFavouritesOpen] = React.useState(true);
	const [allModelsOpen, setAllModelsOpen] = React.useState(true);
	const [customModelId, setCustomModelId] = React.useState("");
	const [customModelName, setCustomModelName] = React.useState("");
	const settingsSnapshot = settings.data?.settings;
	const [favouritesDraft, setFavouritesDraft] = React.useState(() =>
		getFavouriteModels(settingsSnapshot ?? {}),
	);
	const [persistenceError, setPersistenceError] = React.useState<Error | null>(
		null,
	);
	const favouritesDraftRef = React.useRef(favouritesDraft);
	const lastPersistedFavouritesRef = React.useRef(favouritesDraft);
	const lastSettingsSnapshotRef = React.useRef(settingsSnapshot);
	const writeQueueRef = React.useRef<FavouriteModelSetting[][]>([]);
	const queueRunningRef = React.useRef(false);
	const mountedRef = React.useRef(true);
	const [queueIdle, setQueueIdle] = React.useState(true);

	const configuredProviders = React.useMemo(
		() =>
			configuredProviderViews(
				buildProviderViews(
					providers.data?.providers ?? [],
					models.data?.models ?? [],
				),
			),
		[providers.data?.providers, models.data?.models],
	);
	const activeProvider =
		configuredProviders.find(
			(provider) => provider.id === selectedProviderId,
		) ??
		configuredProviders[0] ??
		null;
	const visibleModels = React.useMemo(
		() => filterModels(activeProvider?.models ?? [], query),
		[activeProvider?.models, query],
	);
	const favouriteKeys = new Set(favouritesDraft.map(modelRefKey));
	const favouriteModels = visibleModels.filter((model) =>
		favouriteKeys.has(
			modelRefKey({ provider: model.provider, modelId: model.id }),
		),
	);
	const otherModels = visibleModels.filter(
		(model) =>
			!favouriteKeys.has(
				modelRefKey({ provider: model.provider, modelId: model.id }),
			),
	);

	React.useEffect(() => {
		if (activeProvider?.id === selectedProviderId) return;
		setSelectedProviderId(activeProvider?.id ?? null);
	}, [activeProvider?.id, selectedProviderId]);

	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	React.useEffect(() => {
		if (
			!queueIdle ||
			queueRunningRef.current ||
			settingsSnapshot === lastSettingsSnapshotRef.current
		) {
			return;
		}
		const serverFavourites = getFavouriteModels(settingsSnapshot ?? {});
		lastSettingsSnapshotRef.current = settingsSnapshot;
		lastPersistedFavouritesRef.current = serverFavourites;
		favouritesDraftRef.current = serverFavourites;
		setFavouritesDraft(serverFavourites);
	}, [queueIdle, settingsSnapshot]);

	async function drainFavouriteWrites() {
		if (queueRunningRef.current) return;
		queueRunningRef.current = true;
		if (mountedRef.current) setQueueIdle(false);

		while (writeQueueRef.current.length > 0) {
			const value = writeQueueRef.current.shift();
			if (!value) continue;
			try {
				await setSetting.mutateAsync({ key: "modelFavourites", value });
				lastPersistedFavouritesRef.current = value;
			} catch (error) {
				if (mountedRef.current) {
					setPersistenceError(
						error instanceof Error
							? error
							: new Error("Favourite settings could not be saved"),
					);
				}
				if (writeQueueRef.current.length === 0) {
					const persisted = lastPersistedFavouritesRef.current;
					favouritesDraftRef.current = persisted;
					if (mountedRef.current) setFavouritesDraft(persisted);
				}
			}
		}

		queueRunningRef.current = false;
		if (mountedRef.current) setQueueIdle(true);
	}

	function toggleFavourite(model: ModelSummary) {
		const modelRef = { provider: model.provider, modelId: model.id };
		const key = modelRefKey(modelRef);
		const current = favouritesDraftRef.current;
		const value = current.some((favourite) => modelRefKey(favourite) === key)
			? current.filter((favourite) => modelRefKey(favourite) !== key)
			: [...current, modelRef];

		if (!queueRunningRef.current && writeQueueRef.current.length === 0) {
			setPersistenceError(null);
		}
		favouritesDraftRef.current = value;
		setFavouritesDraft(value);
		writeQueueRef.current.push(value);
		void drainFavouriteWrites();
	}

	return (
		<div className="-m-6 flex h-full flex-col overflow-hidden text-primary">
			<header className="border-b border-divider px-5 py-4">
				<h2 className="type-view-title">Models</h2>
				<div className="mt-1 type-metadata text-muted">
					Choose favourite models for quick access.
				</div>
			</header>

			{persistenceError || setSetting.error ? (
				<div
					role="alert"
					className="mx-5 mt-4 rounded surface-err-soft p-3 type-status text-err"
				>
					Could not update favourites:{" "}
					{(persistenceError ?? setSetting.error)?.message}
				</div>
			) : null}

			{providers.error || models.error || settings.error ? (
				<div
					className="flex flex-1 flex-col gap-3 p-6 type-status"
					role="alert"
				>
					{providers.error ? (
						<div className="rounded surface-err-soft p-3 type-status text-err">
							Could not load providers: {providers.error.message}
						</div>
					) : null}
					{models.error ? (
						<div className="rounded surface-err-soft p-3 type-status text-err">
							Could not load models: {models.error.message}
						</div>
					) : null}
					{settings.error ? (
						<div className="rounded surface-err-soft p-3 type-status text-err">
							Could not load favourite settings: {settings.error.message}
						</div>
					) : null}
				</div>
			) : providers.isLoading || models.isLoading || settings.isLoading ? (
				<div className="flex flex-1 flex-col gap-2 p-6 type-status text-muted">
					{providers.isLoading ? <div>Loading providers…</div> : null}
					{models.isLoading ? <div>Loading models…</div> : null}
					{settings.isLoading ? <div>Loading favourite settings…</div> : null}
				</div>
			) : configuredProviders.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6 text-center type-status">
					<div>
						<div className="type-label">No configured providers</div>
						<div className="mt-1 type-metadata text-muted">
							Open Providers to configure one before choosing favourites.
						</div>
					</div>
				</div>
			) : (
				<div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,260px)_1fr] overflow-hidden">
					<aside className="min-h-0 overflow-y-auto border-r border-divider p-3">
						<div className="flex flex-col gap-1">
							{configuredProviders.map((provider) => (
								<ProviderRow
									key={provider.id}
									provider={provider}
									selected={provider.id === activeProvider?.id}
									onClick={() => setSelectedProviderId(provider.id)}
								/>
							))}
						</div>
					</aside>

					<main className="flex min-h-0 flex-col overflow-hidden">
						<div className="border-b border-divider p-3">
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search models by name or ID…"
								aria-label="Search models"
								className="surface-row w-full rounded px-3 py-2 type-control outline-none"
							/>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-4">
							{activeProvider?.id.startsWith("custom-") ? (
								<div className="mb-4 rounded border border-divider p-3">
									<div className="flex flex-wrap gap-2">
										<input
											aria-label="Custom model ID"
											value={customModelId}
											onChange={(event) => setCustomModelId(event.target.value)}
											placeholder="Model ID"
											className="surface-row min-w-48 flex-1 rounded px-2 py-1 type-control"
										/>
										<input
											aria-label="Custom model display name"
											value={customModelName}
											onChange={(event) =>
												setCustomModelName(event.target.value)
											}
											placeholder="Display name (optional)"
											className="surface-row min-w-48 flex-1 rounded px-2 py-1 type-control"
										/>
										<button
											type="button"
											className="rounded surface-accent-soft px-3 py-1 disabled:opacity-50 type-control"
											disabled={
												!customModelId.trim() || saveCustomModel.isPending
											}
											onClick={() =>
												saveCustomModel.mutate(
													{
														provider: activeProvider.id,
														model: { id: customModelId, name: customModelName },
													},
													{
														onSuccess: () => {
															setCustomModelId("");
															setCustomModelName("");
														},
													},
												)
											}
										>
											Add model
										</button>
										<button
											type="button"
											className="rounded surface-accent-soft px-3 py-1 disabled:opacity-50 type-control"
											disabled={fetchCustomModels.isPending}
											onClick={() =>
												fetchCustomModels.mutate({
													provider: activeProvider.id,
												})
											}
										>
											{fetchCustomModels.isPending
												? "Fetching…"
												: "Fetch Models"}
										</button>
									</div>
									{fetchCustomModels.data ? (
										<div role="status" className="mt-2 type-status text-ok">
											Models refreshed.
										</div>
									) : saveCustomModel.isSuccess ? (
										<div role="status" className="mt-2 type-status text-ok">
											Model saved.
										</div>
									) : removeCustomModel.isSuccess ? (
										<div role="status" className="mt-2 type-status text-ok">
											Model removed.
										</div>
									) : null}
									{fetchCustomModels.error ||
									saveCustomModel.error ||
									removeCustomModel.error ? (
										<div role="alert" className="mt-2 type-status text-err">
											{
												(
													fetchCustomModels.error ??
													saveCustomModel.error ??
													removeCustomModel.error
												)?.message
											}
										</div>
									) : null}
								</div>
							) : null}
							{activeProvider?.models.length === 0 ? (
								<div className="type-status text-muted">
									{activeProvider.name} has no models available.
								</div>
							) : visibleModels.length === 0 ? (
								<div className="type-status text-muted">
									No models match “{query.trim()}”.
								</div>
							) : (
								<div className="flex flex-col gap-3">
									<ModelSection
										title="Favourites"
										models={favouriteModels}
										open={favouritesOpen}
										onToggle={() => setFavouritesOpen((value) => !value)}
										emptyMessage="No favourite models match this search."
										isFavourite
										onToggleFavourite={toggleFavourite}
										onRemove={
											activeProvider.id.startsWith("custom-")
												? (model) =>
														removeCustomModel.mutate({
															provider: activeProvider.id,
															modelId: model.id,
														})
												: undefined
										}
									/>
									<ModelSection
										title="All models"
										models={otherModels}
										open={allModelsOpen}
										onToggle={() => setAllModelsOpen((value) => !value)}
										emptyMessage="All matching models are favourites."
										isFavourite={false}
										onToggleFavourite={toggleFavourite}
										onRemove={
											activeProvider.id.startsWith("custom-")
												? (model) =>
														removeCustomModel.mutate({
															provider: activeProvider.id,
															modelId: model.id,
														})
												: undefined
										}
									/>
								</div>
							)}
						</div>
					</main>
				</div>
			)}
		</div>
	);
}

function ModelSection({
	title,
	models,
	open,
	onToggle,
	emptyMessage,
	isFavourite,
	onToggleFavourite,
	onRemove,
}: {
	title: string;
	models: ModelSummary[];
	open: boolean;
	onToggle: () => void;
	emptyMessage: string;
	isFavourite: boolean;
	onToggleFavourite: (model: ModelSummary) => void;
	onRemove?: (model: ModelSummary) => void;
}) {
	const contentId = `model-section-${title.toLowerCase().replaceAll(" ", "-")}`;
	return (
		<section className="overflow-hidden rounded border border-divider">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={contentId}
				onClick={onToggle}
				className="flex w-full items-center justify-between px-3 py-2 text-left hover:surface-row type-control"
			>
				<span>
					{title} ({models.length})
				</span>
				<span aria-hidden className="text-muted">
					{open ? "▾" : "▸"}
				</span>
			</button>
			{open ? (
				<div
					id={contentId}
					className="flex flex-col gap-2 border-t border-divider p-2"
				>
					{models.length === 0 ? (
						<div className="px-2 py-1 type-status text-muted">
							{emptyMessage}
						</div>
					) : (
						models.map((model) => (
							<ModelRow
								key={model.id}
								model={model}
								isFavourite={isFavourite}
								onToggleFavourite={onToggleFavourite}
								onRemove={onRemove}
							/>
						))
					)}
				</div>
			) : null}
		</section>
	);
}

function ModelRow({
	model,
	isFavourite,
	onToggleFavourite,
	onRemove,
}: {
	model: ModelSummary;
	isFavourite: boolean;
	onToggleFavourite: (model: ModelSummary) => void;
	onRemove?: (model: ModelSummary) => void;
}) {
	const action = isFavourite ? "Remove" : "Add";
	return (
		<div className="surface-row flex items-center justify-between gap-3 rounded px-3 py-2">
			<div className="min-w-0">
				<div className="type-label type-ellipsis">{model.name}</div>
				<div className="min-w-0 type-code type-metadata type-ellipsis text-muted">
					{model.id}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					aria-pressed={isFavourite}
					aria-label={`${action} ${model.name} ${isFavourite ? "from" : "to"} favourites`}
					onClick={() => onToggleFavourite(model)}
					className={`rounded px-2 py-1 type-control ${
						isFavourite
							? "surface-accent-soft text-accent"
							: "text-muted hover:surface-row"
					}`}
				>
					<span aria-hidden="true">{isFavourite ? "★" : "☆"}</span>
				</button>
				{onRemove ? (
					<button
						type="button"
						aria-label={`Remove custom model ${model.name}`}
						onClick={() => onRemove(model)}
						className="rounded px-2 py-1 type-control text-err hover:surface-err-soft"
					>
						Remove
					</button>
				) : null}
			</div>
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
	const count = provider.models.length;
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left type-control ${
				selected
					? "surface-accent-soft text-primary"
					: "text-muted hover:surface-row hover:text-primary"
			}`}
		>
			<span className="type-label type-ellipsis">{provider.name}</span>
			<span className="shrink-0 type-metadata text-muted">
				{count} {count === 1 ? "model" : "models"}
			</span>
		</button>
	);
}
