import React from "react";
import { useModelsJson, useSaveModelsJson } from "../queries";

export function ModelsJsonEditor() {
	const modelsJson = useModelsJson();
	const save = useSaveModelsJson();
	const [open, setOpen] = React.useState(false);
	const [draft, setDraft] = React.useState("");

	React.useEffect(() => {
		if (modelsJson.data) setDraft(modelsJson.data.text);
	}, [modelsJson.data]);

	return (
		<div className="rounded border border-border/40 p-2 text-sm">
			<button
				type="button"
				className="flex w-full items-center justify-between text-left font-medium"
				onClick={() => setOpen((v) => !v)}
			>
				<span>Custom models</span>
				<span>{open ? "▾" : "▸"}</span>
			</button>
			{open ? (
				<div className="mt-2 flex flex-col gap-2">
					{modelsJson.data ? (
						<div className="text-xs text-muted">{modelsJson.data.path}</div>
					) : null}
					{modelsJson.data?.registryError ? (
						<div className="rounded bg-yellow-500/10 p-2 text-xs text-yellow-300">
							{modelsJson.data.registryError}
						</div>
					) : null}
					<textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						spellCheck={false}
						className="surface-row min-h-64 rounded px-2 py-1 font-mono text-xs"
						placeholder={'{\n  "providers": []\n}'}
					/>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={save.isPending}
							className="rounded bg-blue-500/20 px-2 py-1 text-sm hover:opacity-80 disabled:opacity-50"
							onClick={() => save.mutate({ text: draft })}
						>
							{save.isPending ? "Saving…" : "Save models.json"}
						</button>
						{save.data?.registryError ? (
							<span className="text-xs text-yellow-300">{save.data.registryError}</span>
						) : null}
						{save.error ? <span className="text-xs text-red-400">{save.error.message}</span> : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
