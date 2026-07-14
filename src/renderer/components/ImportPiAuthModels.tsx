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
		Boolean(
			(auth && data?.sourceAuthExists) || (models && data?.sourceModelsExists),
		) &&
		(!hasConflict || replaceExisting);

	return (
		<div className="flex flex-col gap-2 rounded border border-border/40 p-2 type-body">
			<div className="type-section-heading">Import from installed pi</div>
			{status.error ? (
				<div className="type-status type-technical-wrap text-err">
					{status.error.message}
				</div>
			) : null}
			{data ? (
				<div className="grid gap-1 type-metadata text-muted">
					<div>
						Source auth:{" "}
						<span className="type-code type-technical-wrap">
							{data.sourceAuthPath}
						</span>
					</div>
					<div>
						Source models:{" "}
						<span className="type-code type-technical-wrap">
							{data.sourceModelsPath}
						</span>
					</div>
					<div>
						macpi auth:{" "}
						<span className="type-code type-technical-wrap">
							{data.destAuthPath}
						</span>
					</div>
					<div>
						macpi models:{" "}
						<span className="type-code type-technical-wrap">
							{data.destModelsPath}
						</span>
					</div>
				</div>
			) : null}
			<label className="flex items-center gap-2 type-label">
				<input
					type="checkbox"
					checked={auth}
					onChange={(e) => setAuth(e.target.checked)}
				/>
				Import auth.json {data?.sourceAuthExists ? "" : "(missing)"}
			</label>
			<label className="flex items-center gap-2 type-label">
				<input
					type="checkbox"
					checked={models}
					onChange={(e) => setModels(e.target.checked)}
				/>
				Import models.json {data?.sourceModelsExists ? "" : "(missing)"}
			</label>
			{hasConflict ? (
				<label className="flex items-center gap-2 type-label text-warn">
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
				className="surface-row rounded px-2 py-1 text-left type-control hover:opacity-80 disabled:opacity-50"
			>
				{importMutation.isPending ? "Importing…" : "Import from installed pi"}
			</button>
			{importMutation.data ? (
				<div className="type-status text-ok">
					Imported auth: {String(importMutation.data.copiedAuth)}, models:{" "}
					{String(importMutation.data.copiedModels)}
				</div>
			) : null}
			{importMutation.error ? (
				<div className="type-status type-technical-wrap text-err">
					{importMutation.error.message}
				</div>
			) : null}
		</div>
	);
}
