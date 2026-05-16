import React from "react";
import type { ModelSummary, SelectedModelRef } from "../../shared/model-auth-types";

interface ModelPickerProps {
	models: ModelSummary[];
	selected: SelectedModelRef | null;
	onSelect: (model: SelectedModelRef) => void;
}

export function ModelPicker({ models, selected, onSelect }: ModelPickerProps) {
	const [query, setQuery] = React.useState("");
	const normalized = query.trim().toLowerCase();
	const filtered = normalized
		? models.filter((model) =>
				[model.provider, model.providerName, model.id, model.name]
					.join(" ")
					.toLowerCase()
					.includes(normalized),
			)
		: models;
	const groups = filtered.reduce<Record<string, ModelSummary[]>>((acc, model) => {
		(acc[model.provider] ??= []).push(model);
		return acc;
	}, {});

	return (
		<div className="flex flex-col gap-2">
			<input
				type="search"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Search models…"
				className="surface-row rounded px-2 py-1 text-sm"
			/>
			{Object.keys(groups).length === 0 ? (
				<div className="text-sm text-muted">No models match.</div>
			) : (
				Object.entries(groups).map(([provider, providerModels]) => (
					<div key={provider} className="rounded border border-border/40 p-2">
						<div className="mb-2 text-xs font-semibold text-muted">
							{providerModels[0]?.providerName ?? provider}
						</div>
						<div className="flex flex-col gap-1">
							{providerModels.map((model) => {
								const isSelected =
									selected?.provider === model.provider && selected.modelId === model.id;
								return (
									<button
										type="button"
										key={`${model.provider}/${model.id}`}
										disabled={!model.authConfigured}
										onClick={() =>
											onSelect({ provider: model.provider, modelId: model.id })
										}
										className={`rounded px-2 py-1 text-left text-sm ${
											isSelected ? "bg-blue-500/20" : "surface-row"
										} ${model.authConfigured ? "hover:opacity-80" : "opacity-60"}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span>{model.name}</span>
											<span className="text-xs text-muted">
												{model.authConfigured ? "Select" : "Configure auth first"}
											</span>
										</div>
										<div className="text-xs text-muted">
											{model.id} · {model.contextWindow.toLocaleString()} ctx
											{model.reasoning ? " · reasoning" : ""}
											{model.usingOAuth ? " · OAuth" : ""}
										</div>
									</button>
								);
							})}
						</div>
					</div>
				))
			)}
		</div>
	);
}
