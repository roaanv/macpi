import React from "react";
import {
	getFavouriteModels,
	modelRefKey,
} from "../../shared/app-settings-keys";
import type {
	ModelSummary,
	SelectedModelRef,
} from "../../shared/model-auth-types";
import {
	useModelAuthModels,
	useModelAuthProviders,
	useSetSelectedModel,
	useSettings,
} from "../queries";

export function DefaultModelMenu({
	currentModel,
	currentLabel,
	disabled,
}: {
	currentModel: SelectedModelRef | null;
	currentLabel: string;
	disabled: boolean;
}) {
	const providers = useModelAuthProviders();
	const models = useModelAuthModels();
	const settings = useSettings();
	const setSelected = useSetSelectedModel();
	const [open, setOpen] = React.useState(false);
	const [search, setSearch] = React.useState("");
	const [error, setError] = React.useState<string | null>(null);
	const wrapperRef = React.useRef<HTMLDivElement>(null);
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	const searchRef = React.useRef<HTMLInputElement>(null);
	const pending = setSelected.isPending;
	const dialogId = "default-model-menu-dialog";
	const providerNames = new Map(
		(providers.data?.providers ?? [])
			.filter((p) => p.authStatus.configured)
			.map((p) => [p.id, p.name]),
	);
	const favouriteKeys = new Set(
		getFavouriteModels(settings.data?.settings ?? {}).map(modelRefKey),
	);
	const normalized = search.trim().toLowerCase();
	const visible = (models.data?.models ?? []).filter((model) => {
		if (!model.authConfigured || !providerNames.has(model.provider))
			return false;
		if (!normalized) return true;
		return `${providerNames.get(model.provider)} ${model.provider} ${model.name} ${model.id}`
			.toLowerCase()
			.includes(normalized);
	});
	const favourites = visible.filter((model) =>
		favouriteKeys.has(
			modelRefKey({ provider: model.provider, modelId: model.id }),
		),
	);

	const close = React.useCallback(() => {
		setOpen(false);
		queueMicrotask(() => triggerRef.current?.focus());
	}, []);
	React.useEffect(() => {
		if (open) searchRef.current?.focus();
	}, [open]);
	React.useEffect(() => {
		if (!open) return;
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pending) close();
		};
		const pointer = (event: PointerEvent) => {
			if (!pending && !wrapperRef.current?.contains(event.target as Node))
				close();
		};
		document.addEventListener("keydown", key);
		document.addEventListener("pointerdown", pointer);
		return () => {
			document.removeEventListener("keydown", key);
			document.removeEventListener("pointerdown", pointer);
		};
	}, [close, open, pending]);

	async function choose(model: SelectedModelRef | null) {
		if (pending) return;
		setError(null);
		try {
			await setSelected.mutateAsync({ model });
			close();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Could not save default model",
			);
		}
	}
	const currentKey = currentModel ? modelRefKey(currentModel) : null;
	const row = (model: ModelSummary) => {
		const selected =
			modelRefKey({ provider: model.provider, modelId: model.id }) ===
			currentKey;
		return (
			<button
				key={`${model.provider}/${model.id}`}
				type="button"
				role="option"
				aria-selected={selected}
				disabled={pending}
				onClick={() =>
					void choose({ provider: model.provider, modelId: model.id })
				}
				className="flex w-full min-w-0 justify-between rounded px-2 py-1.5 text-left type-control hover:surface-row disabled:opacity-50"
			>
				<span className="min-w-0 flex-1">
					<span className="block type-ellipsis">{model.name}</span>
					<span className="block type-code type-metadata type-ellipsis text-muted">
						{model.id}
					</span>
				</span>
				{selected ? <span className="text-accent">Current</span> : null}
			</button>
		);
	};

	return (
		<div ref={wrapperRef} className="relative">
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled || pending}
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-controls={open ? dialogId : undefined}
				onClick={() => {
					setSearch("");
					setError(null);
					setOpen((value) => !value);
				}}
				className="surface-row flex w-full justify-between rounded px-3 py-2 text-left type-control disabled:opacity-50"
			>
				<span>{currentLabel}</span>
				<span aria-hidden>▾</span>
			</button>
			{open ? (
				<div
					id={dialogId}
					role="dialog"
					aria-label="Choose default model"
					className="surface-panel absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded border border-divider p-2 shadow-xl"
				>
					<label
						className="sr-only type-label"
						htmlFor="default-model-menu-search"
					>
						Search configured models
					</label>
					<input
						id="default-model-menu-search"
						ref={searchRef}
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search configured models…"
						className="surface-row mb-2 w-full rounded px-2 py-1 type-control"
					/>
					<button
						type="button"
						role="option"
						aria-selected={!currentModel}
						disabled={pending}
						onClick={() => void choose(null)}
						className="flex w-full justify-between rounded px-2 py-1.5 text-left type-control hover:surface-row"
					>
						<span>Automatic fallback</span>
						{!currentModel ? (
							<span className="text-accent">Current</span>
						) : null}
					</button>
					<div className="mt-2 px-2 type-overline text-muted">Favourites</div>
					{favourites.length ? (
						favourites.map(row)
					) : (
						<div className="px-2 py-1 type-metadata text-muted">
							No favourite models.
						</div>
					)}
					<div className="mt-2 border-t border-divider px-2 pt-2 type-overline text-muted">
						All
					</div>
					{[...providerNames].map(([provider, name]) => {
						const providerModels = visible.filter(
							(model) => model.provider === provider,
						);
						return providerModels.length ? (
							<div key={provider}>
								<div className="px-2 py-1 type-overline">{name}</div>
								{providerModels.map(row)}
							</div>
						) : null;
					})}
					{visible.length === 0 && normalized ? (
						<div className="px-2 py-2 type-metadata text-muted">
							No models match this search.
						</div>
					) : null}
					{pending ? (
						<div role="status" className="mt-2 type-status text-muted">
							Saving default model…
						</div>
					) : null}
					{error ? (
						<div role="alert" className="mt-2 type-status text-err">
							{error}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
