// Right-pane extension detail. Manifest header + CodeEditor (TypeScript mode)
// + Save + Lint + Uninstall (with confirm dialog) + DiagnosticsPanel. Tracks
// a local `draft` and auto-runs Biome lint after each successful save.

import React from "react";
import type { ExtensionDiagnostic } from "../../shared/extensions-types";
import {
	useExtensionDetail,
	useLintExtension,
	useRemoveExtension,
	useSaveExtension,
} from "../queries";
import { CodeEditor } from "./CodeEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

interface ExtensionDetailProps {
	id: string | null;
	onUninstalled?: () => void;
}

export function ExtensionDetail({ id, onUninstalled }: ExtensionDetailProps) {
	const detail = useExtensionDetail(id);
	const save = useSaveExtension();
	const lint = useLintExtension();
	const remove = useRemoveExtension();
	const [draft, setDraft] = React.useState("");
	const [diagnostics, setDiagnostics] = React.useState<ExtensionDiagnostic[]>(
		[],
	);
	const [confirmRemove, setConfirmRemove] = React.useState(false);
	const [removeError, setRemoveError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (detail.data) {
			setDraft(detail.data.body);
			setDiagnostics([]);
		}
	}, [detail.data]);

	if (!id) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Select an extension on the left to view or edit it.
			</section>
		);
	}
	if (detail.isLoading) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Loading…
			</section>
		);
	}
	if (detail.isError || !detail.data) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-red-300">
				{(detail.error as Error)?.message ?? "Extension not found."}
			</section>
		);
	}

	const dirty = draft !== detail.data.body;
	const source = detail.data.manifest.source;
	const extName = detail.data.manifest.name;

	const handleSave = () => {
		if (!id) return;
		save.mutate(
			{ id, body: draft },
			{
				onSuccess: () => {
					// Auto-lint after save.
					lint.mutate(
						{ id },
						{
							onSuccess: (r) => setDiagnostics(r.diagnostics),
						},
					);
				},
			},
		);
	};

	const handleLint = () => {
		if (!id) return;
		lint.mutate({ id }, { onSuccess: (r) => setDiagnostics(r.diagnostics) });
	};

	const handleUninstall = async () => {
		setRemoveError(null);
		try {
			await remove.mutateAsync({ source });
			setConfirmRemove(false);
			onUninstalled?.();
		} catch (e) {
			setRemoveError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<section className="flex flex-1 flex-col surface-panel">
			<header className="border-b border-divider p-3">
				<div className="text-sm font-semibold text-primary">{extName}</div>
				<div className="text-xs text-muted">
					{source} · {detail.data.manifest.relativePath}
				</div>
			</header>
			<CodeEditor value={draft} onChange={setDraft} language="typescript" />
			<footer className="flex items-center justify-end gap-2 border-t border-divider p-2">
				{dirty && <span className="text-xs text-amber-300">• unsaved</span>}
				<button
					type="button"
					onClick={() => setConfirmRemove(true)}
					disabled={remove.isPending}
					className="mr-auto rounded px-3 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-40"
				>
					Uninstall…
				</button>
				<button
					type="button"
					onClick={handleLint}
					disabled={lint.isPending}
					className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
				>
					{lint.isPending ? "Linting…" : "Lint"}
				</button>
				<button
					type="button"
					disabled={!dirty || save.isPending}
					onClick={handleSave}
					className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
				>
					{save.isPending ? "Saving…" : "Save"}
				</button>
			</footer>
			<DiagnosticsPanel diagnostics={diagnostics} />
			<ConfirmDialog
				open={confirmRemove}
				title="Uninstall extension?"
				body={
					<>
						Remove <code>{extName}</code> from <code>{source}</code>. The files
						are deleted from disk; you can reinstall any time.
						{removeError && (
							<div className="mt-2 text-red-400">⚠ {removeError}</div>
						)}
					</>
				}
				confirmLabel={remove.isPending ? "Uninstalling…" : "Uninstall"}
				destructive
				onConfirm={handleUninstall}
				onCancel={() => {
					setConfirmRemove(false);
					setRemoveError(null);
				}}
			/>
		</section>
	);
}
