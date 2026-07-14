import React from "react";
import {
	getFavouriteModels,
	modelRefKey,
} from "../../shared/app-settings-keys";
import type { ModelSummary } from "../../shared/model-auth-types";
import {
	useModelAuthModels,
	useModelAuthProviders,
	useSetSessionModel,
	useSettings,
} from "../queries";

interface ChatModelMenuProps {
	piSessionId: string;
	currentModel: { provider: string; id: string } | null;
	modelLabel: string;
	streaming: boolean;
}

interface ModelGroup {
	provider: string;
	providerName: string;
	models: ModelSummary[];
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export function ChatModelMenu({
	piSessionId,
	currentModel,
	modelLabel,
	streaming,
}: ChatModelMenuProps) {
	const providersQuery = useModelAuthProviders();
	const modelsQuery = useModelAuthModels();
	const settingsQuery = useSettings();
	const setModel = useSetSessionModel();
	const [open, setOpen] = React.useState(false);
	const [search, setSearch] = React.useState("");
	const [selectionError, setSelectionError] = React.useState<string | null>(
		null,
	);
	const [selecting, setSelecting] = React.useState(false);
	const wrapperRef = React.useRef<HTMLSpanElement>(null);
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	const searchRef = React.useRef<HTMLInputElement>(null);
	const mountedRef = React.useRef(true);
	const focusFrameRef = React.useRef<number | null>(null);
	const restoreFocusWhenReadyRef = React.useRef(false);
	const pending = selecting || setModel.isPending;

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
	const favouriteKeys = React.useMemo(
		() =>
			new Set(
				getFavouriteModels(settingsQuery.data?.settings ?? {}).map(modelRefKey),
			),
		[settingsQuery.data?.settings],
	);
	const normalizedSearch = search.trim().toLocaleLowerCase();
	const visibleModels = React.useMemo(
		() =>
			configuredModels.filter((model) => {
				if (!normalizedSearch) return true;
				const providerName = configuredProviders.get(model.provider) ?? "";
				return `${providerName} ${model.provider} ${model.providerName} ${model.name} ${model.id}`
					.toLocaleLowerCase()
					.includes(normalizedSearch);
			}),
		[configuredModels, configuredProviders, normalizedSearch],
	);
	const favourites = visibleModels.filter((model) =>
		favouriteKeys.has(
			modelRefKey({ provider: model.provider, modelId: model.id }),
		),
	);
	const groups = React.useMemo(() => {
		const result: ModelGroup[] = [];
		for (const [provider, providerName] of configuredProviders) {
			const providerModels = visibleModels.filter(
				(model) => model.provider === provider,
			);
			if (providerModels.length > 0) {
				result.push({ provider, providerName, models: providerModels });
			}
		}
		return result;
	}, [configuredProviders, visibleModels]);

	const closeAndFocus = React.useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (
				focusFrameRef.current !== null &&
				typeof cancelAnimationFrame === "function"
			) {
				cancelAnimationFrame(focusFrameRef.current);
			}
		};
	}, []);

	React.useEffect(() => {
		if (open || pending || !restoreFocusWhenReadyRef.current) return;
		restoreFocusWhenReadyRef.current = false;
		const focusTrigger = () => {
			focusFrameRef.current = null;
			if (mountedRef.current) triggerRef.current?.focus();
		};
		if (typeof requestAnimationFrame === "function") {
			focusFrameRef.current = requestAnimationFrame(focusTrigger);
		} else {
			queueMicrotask(focusTrigger);
		}
	}, [open, pending]);

	React.useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pending) {
				event.preventDefault();
				closeAndFocus();
			}
		};
		const onPointerDown = (event: PointerEvent) => {
			if (!pending && !wrapperRef.current?.contains(event.target as Node)) {
				closeAndFocus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [closeAndFocus, open, pending]);

	React.useEffect(() => {
		if (open) searchRef.current?.focus();
	}, [open]);

	function toggleOpen() {
		if (streaming || pending) return;
		setOpen((wasOpen) => {
			if (!wasOpen) {
				setSearch("");
				setSelectionError(null);
			}
			return !wasOpen;
		});
	}

	async function select(model: ModelSummary) {
		if (pending || streaming) return;
		setSelecting(true);
		setSelectionError(null);
		try {
			await setModel.mutateAsync({
				piSessionId,
				model: { provider: model.provider, modelId: model.id },
			});
			restoreFocusWhenReadyRef.current = true;
			setOpen(false);
		} catch (error) {
			setSelectionError(errorMessage(error, "Could not change model"));
		} finally {
			setSelecting(false);
		}
	}

	return (
		<span className="relative inline-flex" ref={wrapperRef}>
			<button
				ref={triggerRef}
				type="button"
				onClick={toggleOpen}
				disabled={streaming || pending}
				aria-expanded={open}
				aria-haspopup="dialog"
				className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-primary hover:surface-row disabled:cursor-not-allowed disabled:opacity-50 type-control"
				title={
					currentModel
						? `${currentModel.provider}/${currentModel.id}`
						: undefined
				}
			>
				<span aria-hidden className="text-faint">
					◆
				</span>
				<span>{modelLabel}</span>
				<span aria-hidden className="text-faint">
					▾
				</span>
			</button>
			{open ? (
				<div
					role="dialog"
					aria-label="Choose chat model"
					className="absolute bottom-full left-0 z-50 mb-2 flex max-h-[min(28rem,70vh)] w-80 flex-col overflow-hidden rounded-lg border border-divider surface-panel p-2 text-left shadow-xl"
				>
					<label className="sr-only type-label" htmlFor="chat-model-search">
						Search chat models
					</label>
					<input
						ref={searchRef}
						id="chat-model-search"
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search models…"
						className="mb-2 w-full rounded surface-row px-2 py-1.5 type-control text-primary outline-none"
					/>
					<div
						role="listbox"
						aria-label="Available chat models"
						className="min-h-0 overflow-y-auto"
					>
						{providersQuery.error ||
						modelsQuery.error ||
						settingsQuery.error ? (
							<div className="space-y-1 p-2 type-status text-err" role="alert">
								{providersQuery.error ? (
									<div>
										Providers could not be loaded:{" "}
										{errorMessage(
											providersQuery.error,
											"Unknown provider error",
										)}
									</div>
								) : null}
								{modelsQuery.error ? (
									<div>
										Models could not be loaded:{" "}
										{errorMessage(modelsQuery.error, "Unknown model error")}
									</div>
								) : null}
								{settingsQuery.error ? (
									<div>
										Settings could not be loaded:{" "}
										{errorMessage(
											settingsQuery.error,
											"Unknown settings error",
										)}
									</div>
								) : null}
							</div>
						) : providersQuery.isLoading ||
							modelsQuery.isLoading ||
							settingsQuery.isLoading ? (
							<div
								className="space-y-1 p-2 type-status text-muted"
								role="status"
							>
								{providersQuery.isLoading ? (
									<div>Loading providers…</div>
								) : null}
								{modelsQuery.isLoading ? <div>Loading models…</div> : null}
								{settingsQuery.isLoading ? (
									<div>Loading favourites…</div>
								) : null}
							</div>
						) : configuredProviders.size === 0 ? (
							<div className="p-2 type-status text-muted">
								<div className="type-label text-primary">
									No configured providers
								</div>
								<div className="mt-1">Open Providers to configure one.</div>
							</div>
						) : (
							<>
								<section aria-labelledby="chat-model-favourites">
									<h3
										id="chat-model-favourites"
										className="px-2 py-1 type-overline text-faint"
									>
										Favourites
									</h3>
									{favourites.length > 0 ? (
										favourites.map((model) => (
											<ModelChoice
												key={`favourite:${model.provider}:${model.id}`}
												model={model}
												currentModel={currentModel}
												disabled={pending || streaming}
												onSelect={select}
											/>
										))
									) : (
										<div className="px-2 py-1 type-status text-muted">
											No favourite models
											{normalizedSearch ? " match your search" : ""}.
										</div>
									)}
								</section>
								<section
									aria-labelledby="chat-model-all"
									className="mt-2 border-divider border-t pt-1"
								>
									<h3
										id="chat-model-all"
										className="px-2 py-1 type-overline text-faint"
									>
										All
									</h3>
									{groups.map((group) => (
										<fieldset className="m-0 border-0 p-0" key={group.provider}>
											<legend className="w-full px-2 pb-0.5 pt-1 type-overline text-muted">
												{group.providerName}
											</legend>
											{group.models.map((model) => (
												<ModelChoice
													key={`${model.provider}:${model.id}`}
													model={model}
													currentModel={currentModel}
													disabled={pending || streaming}
													onSelect={select}
												/>
											))}
										</fieldset>
									))}
									{normalizedSearch && groups.length === 0 ? (
										<div className="px-2 py-2 type-status text-muted">
											No models match your search.
										</div>
									) : null}
								</section>
							</>
						)}
					</div>
					{selectionError ? (
						<div
							role="alert"
							className="mt-2 border-divider border-t px-2 pt-2 type-status text-err"
						>
							Could not change model: {selectionError}
						</div>
					) : null}
				</div>
			) : null}
		</span>
	);
}

function ModelChoice({
	model,
	currentModel,
	disabled,
	onSelect,
}: {
	model: ModelSummary;
	currentModel: { provider: string; id: string } | null;
	disabled: boolean;
	onSelect: (model: ModelSummary) => void;
}) {
	const current =
		currentModel?.provider === model.provider && currentModel.id === model.id;
	return (
		<button
			type="button"
			role="option"
			aria-selected={current}
			aria-label={current ? `${model.name}, Current model` : model.name}
			title={`${model.name} (${model.id})`}
			disabled={disabled}
			onClick={() => void onSelect(model)}
			className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left type-control hover:surface-row disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span className="min-w-0">
				<span className="block type-ellipsis text-primary">{model.name}</span>
				<span className="block type-code type-metadata type-ellipsis text-faint">
					{model.id}
				</span>
			</span>
			{current ? (
				<span className="shrink-0 text-accent" aria-hidden>
					✓
				</span>
			) : null}
		</button>
	);
}
