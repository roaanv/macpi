import { useModelAuthModels, useModelAuthProviders, useSelectedModel, useSetSelectedModel } from "../queries";
import React from "react";
import { ImportPiAuthModels } from "./ImportPiAuthModels";
import { ModelPicker } from "./ModelPicker";
import { ModelsJsonEditor } from "./ModelsJsonEditor";
import { OAuthLoginDialog } from "./OAuthLoginDialog";
import { ProviderAuthList } from "./ProviderAuthList";

export function ModelsAuthSettings() {
	const providers = useModelAuthProviders();
	const models = useModelAuthModels();
	const selected = useSelectedModel();
	const setSelected = useSetSelectedModel();
	const [oauthProvider, setOAuthProvider] = React.useState<string | null>(null);

	const selectedLabel = selected.data?.model
		? `${selected.data.model.provider}/${selected.data.model.modelId}`
		: "No model selected";

	return (
		<div className="flex flex-col gap-4">
			<OAuthLoginDialog
				provider={oauthProvider}
				onClose={() => setOAuthProvider(null)}
			/>
			<div>
				<h2 className="text-base font-semibold">Models & Auth</h2>
				<div className="text-xs text-muted">
					Configure providers and choose which pi model macpi sessions use.
				</div>
			</div>

			<section className="flex flex-col gap-2">
				<div className="text-sm font-medium">Selected model</div>
				<div className="surface-row rounded p-2 text-sm">
					<div>{selectedLabel}</div>
					{selected.data && !selected.data.valid ? (
						<div className="mt-1 text-xs text-red-400">{selected.data.error}</div>
					) : null}
					{selected.error ? (
						<div className="mt-1 text-xs text-red-400">
							{selected.error.message}
						</div>
					) : null}
				</div>
			</section>

			<section className="flex flex-col gap-2">
				<ImportPiAuthModels />
			</section>

			<section className="flex flex-col gap-2">
				<div className="text-sm font-medium">Providers</div>
				{providers.error ? (
					<div className="rounded bg-red-500/10 p-2 text-sm text-red-300">
						{providers.error.message}
					</div>
				) : (
					<ProviderAuthList
						providers={providers.data?.providers ?? []}
						loading={providers.isLoading}
						onStartOAuth={setOAuthProvider}
					/>
				)}
			</section>

			<section className="flex flex-col gap-2">
				<ModelsJsonEditor />
			</section>

			<section className="flex flex-col gap-2">
				<div className="text-sm font-medium">Models</div>
				{models.data?.registryError ? (
					<div className="rounded bg-yellow-500/10 p-2 text-sm text-yellow-300">
						{models.data.registryError}
					</div>
				) : null}
				{models.error ? (
					<div className="rounded bg-red-500/10 p-2 text-sm text-red-300">
						{models.error.message}
					</div>
				) : (
					<ModelPicker
						models={models.data?.models ?? []}
						selected={selected.data?.model ?? null}
						onSelect={(model) => setSelected.mutate({ model })}
					/>
				)}
			</section>
		</div>
	);
}
