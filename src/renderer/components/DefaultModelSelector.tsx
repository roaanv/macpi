import React from "react";
import type {
	ModelSummary,
	SelectedModelRef,
} from "../../shared/model-auth-types";
import {
	useModelAuthModels,
	useModelAuthProviders,
	useSelectedModel,
	useSetSelectedModel,
} from "../queries";

export const AUTOMATIC_DEFAULT_MODEL_VALUE = "automatic";
const MODEL_VALUE_PREFIX = "model:";

export function encodeDefaultModelValue(model: SelectedModelRef): string {
	return `${MODEL_VALUE_PREFIX}${encodeURIComponent(
		JSON.stringify([model.provider, model.modelId]),
	)}`;
}

export function decodeDefaultModelValue(
	value: string,
): SelectedModelRef | null {
	if (!value.startsWith(MODEL_VALUE_PREFIX)) return null;
	try {
		const decoded: unknown = JSON.parse(
			decodeURIComponent(value.slice(MODEL_VALUE_PREFIX.length)),
		);
		if (
			!Array.isArray(decoded) ||
			decoded.length !== 2 ||
			typeof decoded[0] !== "string" ||
			decoded[0].length === 0 ||
			typeof decoded[1] !== "string" ||
			decoded[1].length === 0
		) {
			return null;
		}
		return { provider: decoded[0], modelId: decoded[1] };
	} catch {
		return null;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

interface ModelGroup {
	provider: string;
	providerName: string;
	models: ModelSummary[];
}

export function DefaultModelSelector() {
	const providersQuery = useModelAuthProviders();
	const modelsQuery = useModelAuthModels();
	const selectedQuery = useSelectedModel();
	const setSelected = useSetSelectedModel();
	const [search, setSearch] = React.useState("");

	const configuredProviders = React.useMemo(
		() =>
			new Map(
				(providersQuery.data?.providers ?? [])
					.filter((provider) => provider.authStatus.configured)
					.map((provider) => [provider.id, provider.name]),
			),
		[providersQuery.data?.providers],
	);
	const configuredModels = React.useMemo(
		() =>
			(modelsQuery.data?.models ?? []).filter(
				(model) =>
					model.authConfigured && configuredProviders.has(model.provider),
			),
		[configuredProviders, modelsQuery.data?.models],
	);
	const normalizedSearch = search.trim().toLocaleLowerCase();
	const savedModel = selectedQuery.data?.model ?? null;
	const savedValue = savedModel
		? encodeDefaultModelValue(savedModel)
		: AUTOMATIC_DEFAULT_MODEL_VALUE;
	const savedModelSummary = savedModel
		? configuredModels.find(
				(model) =>
					model.provider === savedModel.provider &&
					model.id === savedModel.modelId,
			)
		: undefined;
	const groups = React.useMemo(() => {
		const byProvider = new Map<string, ModelGroup>();
		for (const [provider, providerName] of configuredProviders) {
			byProvider.set(provider, { provider, providerName, models: [] });
		}
		for (const model of configuredModels) {
			const isSavedModel =
				selectedQuery.data?.valid === true && model === savedModelSummary;
			if (
				normalizedSearch &&
				!isSavedModel &&
				!`${model.providerName} ${model.provider} ${model.name} ${model.id}`
					.toLocaleLowerCase()
					.includes(normalizedSearch)
			) {
				continue;
			}
			byProvider.get(model.provider)?.models.push(model);
		}
		return [...byProvider.values()].filter((group) => group.models.length > 0);
	}, [
		configuredModels,
		configuredProviders,
		normalizedSearch,
		savedModelSummary,
		selectedQuery.data?.valid,
	]);
	const savedModelAvailable =
		!savedModel || (selectedQuery.data?.valid === true && !!savedModelSummary);
	const inventoryReady =
		!providersQuery.isLoading &&
		!modelsQuery.isLoading &&
		!providersQuery.error &&
		!modelsQuery.error;
	const unavailableSavedModel =
		savedModel && inventoryReady && !savedModelAvailable;
	const loading =
		providersQuery.isLoading ||
		modelsQuery.isLoading ||
		selectedQuery.isLoading;
	const hasQueryError =
		!!providersQuery.error || !!modelsQuery.error || !!selectedQuery.error;
	const disabled = loading || hasQueryError || setSelected.isPending;

	function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
		if (setSelected.isPending) return;
		if (event.target.value === AUTOMATIC_DEFAULT_MODEL_VALUE) {
			setSelected.mutate({ model: null });
			return;
		}
		const model = decodeDefaultModelValue(event.target.value);
		if (model) setSelected.mutate({ model });
	}

	return (
		<section aria-labelledby="default-model-heading">
			<h3 id="default-model-heading" className="mb-1 text-sm font-medium">
				Default model for new chats
			</h3>
			<div className="mb-2 text-xs text-muted">
				Used for new chats. Existing chats keep their current model.
			</div>

			<div className="mb-2 text-xs">
				<span className="font-medium">Current saved default:</span>{" "}
				{savedModel
					? (savedModelSummary?.name ??
						`${savedModel.provider} / ${savedModel.modelId}`)
					: "Automatic"}
			</div>

			{unavailableSavedModel ? (
				<div role="alert" className="mb-2 text-xs text-warn">
					{selectedQuery.data?.error ??
						"The saved default is not currently available from a configured provider."}{" "}
					Choose Automatic or another configured model to recover.
				</div>
			) : null}

			{providersQuery.isLoading ? (
				<div className="mb-1 text-xs text-muted">Loading providers…</div>
			) : null}
			{modelsQuery.isLoading ? (
				<div className="mb-1 text-xs text-muted">Loading models…</div>
			) : null}
			{selectedQuery.isLoading ? (
				<div className="mb-1 text-xs text-muted">Loading saved default…</div>
			) : null}
			{providersQuery.error ? (
				<div role="alert" className="mb-1 text-xs text-err">
					Providers could not be loaded: {errorMessage(providersQuery.error)}
				</div>
			) : null}
			{modelsQuery.error ? (
				<div role="alert" className="mb-1 text-xs text-err">
					Models could not be loaded: {errorMessage(modelsQuery.error)}
				</div>
			) : null}
			{selectedQuery.error ? (
				<div role="alert" className="mb-1 text-xs text-err">
					Saved default could not be loaded: {errorMessage(selectedQuery.error)}
				</div>
			) : null}
			{modelsQuery.data?.registryError ? (
				<div role="alert" className="mb-1 text-xs text-warn">
					Model registry warning: {modelsQuery.data.registryError}
				</div>
			) : null}

			{!loading && !hasQueryError && configuredModels.length === 0 ? (
				<div className="mb-2 text-xs text-muted">
					No configured models available. Configure a provider in Providers, or
					use Automatic.
				</div>
			) : null}

			<label htmlFor="default-model-search" className="mb-1 block text-xs">
				Search configured models
			</label>
			<input
				id="default-model-search"
				type="search"
				value={search}
				onChange={(event) => setSearch(event.target.value)}
				disabled={disabled}
				placeholder="Provider, model name, or ID"
				className="mb-2 w-full surface-row rounded px-2 py-1 text-sm"
			/>

			<label htmlFor="default-model" className="mb-1 block text-xs">
				Choose default model
			</label>
			<select
				id="default-model"
				value={savedValue}
				onChange={handleChange}
				disabled={disabled}
				className="w-full surface-row rounded px-2 py-1 text-sm"
			>
				<option value={AUTOMATIC_DEFAULT_MODEL_VALUE}>
					Automatic fallback
				</option>
				{unavailableSavedModel ? (
					<optgroup label="Unavailable saved default">
						<option value={savedValue} disabled>
							Unavailable: {savedModel.provider} / {savedModel.modelId}
						</option>
					</optgroup>
				) : null}
				{groups.map((group) => (
					<optgroup key={group.provider} label={group.providerName}>
						{group.models.map((model) => (
							<option
								key={encodeDefaultModelValue({
									provider: model.provider,
									modelId: model.id,
								})}
								value={encodeDefaultModelValue({
									provider: model.provider,
									modelId: model.id,
								})}
							>
								{model.name}
							</option>
						))}
					</optgroup>
				))}
			</select>

			{setSelected.isPending ? (
				<div role="status" className="mt-1 text-xs text-muted">
					Saving default model…
				</div>
			) : null}
			{setSelected.error ? (
				<div role="alert" className="mt-1 text-xs text-err">
					Default model could not be saved: {errorMessage(setSelected.error)}
				</div>
			) : null}
		</section>
	);
}
