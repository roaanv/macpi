import React from "react";
import { useImportPiAuthModels, useModelAuthImportStatus } from "../queries";

export function ImportPiAuthModels() {
	const status = useModelAuthImportStatus();
	const importMutation = useImportPiAuthModels();
	const [auth, setAuth] = React.useState(true);
	const [models, setModels] = React.useState(true);
	const [replaceExisting, setReplaceExisting] = React.useState(false);
	const data = status.data;
	const hasConflict = Boolean(
		(auth && data?.destAuthExists) || (models && data?.destModelsExists),
	);
	const canImport =
		Boolean((auth && data?.sourceAuthExists) || (models && data?.sourceModelsExists)) &&
		(!hasConflict || replaceExisting);

	return (
		<div className="flex flex-col gap-2 rounded border border-border/40 p-2 text-sm">
			<div className="font-medium">Import from installed pi</div>
			{status.error ? <div className="text-xs text-red-400">{status.error.message}</div> : null}
			{data ? (
				<div className="grid gap-1 text-xs text-muted">
					<div>Source auth: {data.sourceAuthPath}</div>
					<div>Source models: {data.sourceModelsPath}</div>
					<div>macpi auth: {data.destAuthPath}</div>
					<div>macpi models: {data.destModelsPath}</div>
				</div>
			) : null}
			<label className="flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					checked={auth}
					onChange={(e) => setAuth(e.target.checked)}
				/>
				Import auth.json {data?.sourceAuthExists ? "" : "(missing)"}
			</label>
			<label className="flex items-center gap-2 text-xs">
				<input
					type="checkbox"
					checked={models}
					onChange={(e) => setModels(e.target.checked)}
				/>
				Import models.json {data?.sourceModelsExists ? "" : "(missing)"}
			</label>
			{hasConflict ? (
				<label className="flex items-center gap-2 text-xs text-yellow-300">
					<input
						type="checkbox"
						checked={replaceExisting}
						onChange={(e) => setReplaceExisting(e.target.checked)}
					/>
					Replace existing macpi files
				</label>
			) : null}
			<button
				type="button"
				disabled={!canImport || importMutation.isPending}
				onClick={() => importMutation.mutate({ auth, models, replaceExisting })}
				className="surface-row rounded px-2 py-1 text-left text-sm hover:opacity-80 disabled:opacity-50"
			>
				{importMutation.isPending ? "Importing…" : "Import from installed pi"}
			</button>
			{importMutation.data ? (
				<div className="text-xs text-green-400">
					Imported auth: {String(importMutation.data.copiedAuth)}, models: {String(importMutation.data.copiedModels)}
				</div>
			) : null}
			{importMutation.error ? (
				<div className="text-xs text-red-400">{importMutation.error.message}</div>
			) : null}
		</div>
	);
}
