import React from "react";
import type { SelectedModelRef } from "../../shared/model-auth-types";
import {
	useModelAuthModels,
	useModelAuthProviders,
	useSelectedModel,
} from "../queries";
import { DefaultModelMenu } from "./DefaultModelMenu";

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

export function DefaultModelSelector() {
	const providersQuery = useModelAuthProviders();
	const modelsQuery = useModelAuthModels();
	const selectedQuery = useSelectedModel();

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
	const savedModel = selectedQuery.data?.model ?? null;
	const savedModelSummary = savedModel
		? configuredModels.find(
				(model) =>
					model.provider === savedModel.provider &&
					model.id === savedModel.modelId,
			)
		: undefined;
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
	const disabled = loading || hasQueryError;

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

			<div className="mb-1 text-xs">Choose default model</div>
			<DefaultModelMenu
				currentModel={savedModel}
				currentLabel={
					savedModel
						? (savedModelSummary?.name ??
							`${savedModel.provider} / ${savedModel.modelId}`)
						: "Automatic fallback"
				}
				disabled={disabled}
			/>
		</section>
	);
}
