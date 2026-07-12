import React from "react";
import {
	type FavouriteModelSetting,
	getFavouriteModels,
	modelRefKey,
} from "../../shared/app-settings-keys";
import type { ModelSummary } from "../../shared/model-auth-types";
import {
	useModelAuthModels,
	useModelAuthProviders,
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
	const [selectedProviderId, setSelectedProviderId] = React.useState<
		string | null
	>(null);
	const [query, setQuery] = React.useState("");
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
				<h2 className="text-xl font-semibold">Models</h2>
				<div className="mt-1 text-sm text-muted">
					Choose favourite models for quick access.
				</div>
			</header>

			{persistenceError || setSetting.error ? (
				<div
					role="alert"
					className="mx-5 mt-4 rounded surface-err-soft p-3 text-err text-sm"
				>
					Could not update favourites:{" "}
					{(persistenceError ?? setSetting.error)?.message}
				</div>
			) : null}

			{providers.error || models.error || settings.error ? (
				<div className="flex flex-1 flex-col gap-3 p-6" role="alert">
					{providers.error ? (
						<div className="rounded surface-err-soft p-3 text-err text-sm">
							Could not load providers: {providers.error.message}
						</div>
					) : null}
					{models.error ? (
						<div className="rounded surface-err-soft p-3 text-err text-sm">
							Could not load models: {models.error.message}
						</div>
					) : null}
					{settings.error ? (
						<div className="rounded surface-err-soft p-3 text-err text-sm">
							Could not load favourite settings: {settings.error.message}
						</div>
					) : null}
				</div>
			) : providers.isLoading || models.isLoading || settings.isLoading ? (
				<div className="flex flex-1 flex-col gap-2 p-6 text-muted text-sm">
					{providers.isLoading ? <div>Loading providers…</div> : null}
					{models.isLoading ? <div>Loading models…</div> : null}
					{settings.isLoading ? <div>Loading favourite settings…</div> : null}
				</div>
			) : configuredProviders.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-6 text-center">
					<div>
						<div className="font-medium">No configured providers</div>
						<div className="mt-1 text-sm text-muted">
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
								className="surface-row w-full rounded px-3 py-2 text-sm outline-none"
							/>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-4">
							{activeProvider?.models.length === 0 ? (
								<div className="text-sm text-muted">
									{activeProvider.name} has no models available.
								</div>
							) : visibleModels.length === 0 ? (
								<div className="text-sm text-muted">
									No models match “{query.trim()}”.
								</div>
							) : (
								<div className="flex flex-col gap-2">
									{visibleModels.map((model) => {
										const isFavourite = favouriteKeys.has(
											modelRefKey({
												provider: model.provider,
												modelId: model.id,
											}),
										);
										const action = isFavourite ? "Remove" : "Add";
										return (
											<div
												key={model.id}
												className="surface-row flex items-center justify-between gap-3 rounded px-3 py-2"
											>
												<div className="min-w-0">
													<div className="truncate text-sm font-medium">
														{model.name}
													</div>
													<div className="truncate font-mono text-muted text-xs">
														{model.id}
													</div>
												</div>
												<button
													type="button"
													aria-pressed={isFavourite}
													aria-label={`${action} ${model.name} ${isFavourite ? "from" : "to"} favourites`}
													onClick={() => toggleFavourite(model)}
													className={`rounded px-2 py-1 text-lg ${
														isFavourite
															? "surface-accent-soft text-accent"
															: "text-muted hover:surface-row"
													}`}
												>
													<span aria-hidden="true">
														{isFavourite ? "★" : "☆"}
													</span>
												</button>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</main>
				</div>
			)}
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
			className={`flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left ${
				selected
					? "surface-accent-soft text-primary"
					: "text-muted hover:surface-row hover:text-primary"
			}`}
		>
			<span className="truncate text-sm font-medium">{provider.name}</span>
			<span className="shrink-0 text-xs text-muted">
				{count} {count === 1 ? "model" : "models"}
			</span>
		</button>
	);
}
