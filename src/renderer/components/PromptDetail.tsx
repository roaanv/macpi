// Right-pane prompt detail. Editable header (description, argument hint) +
// CodeEditor (markdown) for the body + Uninstall (with confirm dialog). The
// Save button writes the markdown file with frontmatter rebuilt from
// description + argumentHint so the edits round-trip through pi's loader.

import React from "react";
import { usePromptDetail, useRemovePrompt, useSavePrompt } from "../queries";
import { CodeEditor } from "./CodeEditor";
import { ConfirmDialog } from "./ConfirmDialog";

interface PromptDetailProps {
	id: string | null;
	onUninstalled?: () => void;
}

export function PromptDetail({ id, onUninstalled }: PromptDetailProps) {
	const detail = usePromptDetail(id);
	const save = useSavePrompt();
	const remove = useRemovePrompt();
	const [body, setBody] = React.useState("");
	const [description, setDescription] = React.useState("");
	const [argumentHint, setArgumentHint] = React.useState("");
	const [confirmRemove, setConfirmRemove] = React.useState(false);
	const [removeError, setRemoveError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!detail.data) return;
		setBody(detail.data.body);
		setDescription(detail.data.manifest.description ?? "");
		setArgumentHint(detail.data.manifest.argumentHint ?? "");
	}, [detail.data]);

	if (!id) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Select a prompt on the left to view or edit it.
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
				{(detail.error as Error)?.message ?? "Prompt not found."}
			</section>
		);
	}

	const m = detail.data.manifest;
	const dirty =
		body !== detail.data.body ||
		description !== (m.description ?? "") ||
		argumentHint !== (m.argumentHint ?? "");

	const handleUninstall = async () => {
		setRemoveError(null);
		try {
			await remove.mutateAsync({ source: m.source });
			setConfirmRemove(false);
			onUninstalled?.();
		} catch (e) {
			setRemoveError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<section className="flex flex-1 flex-col surface-panel">
			<header className="flex flex-col gap-2 border-b border-divider p-3">
				<div>
					<div className="text-sm font-semibold text-primary">{m.name}</div>
					<div className="text-xs text-muted">
						{m.source} · {m.relativePath}
					</div>
				</div>
				<label className="flex flex-col gap-1 text-xs">
					<span className="text-muted">Description</span>
					<input
						type="text"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="What this prompt does…"
						className="rounded surface-row px-2 py-1 text-primary"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs">
					<span className="text-muted">Argument hint</span>
					<input
						type="text"
						value={argumentHint}
						onChange={(e) => setArgumentHint(e.target.value)}
						placeholder="e.g. <message> (optional)"
						className="rounded surface-row px-2 py-1 text-primary"
					/>
				</label>
			</header>
			<CodeEditor value={body} onChange={setBody} language="markdown" />
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
					disabled={!dirty || save.isPending}
					onClick={() =>
						save.mutate({
							id,
							body,
							description,
							argumentHint,
						})
					}
					className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
				>
					{save.isPending ? "Saving…" : "Save"}
				</button>
			</footer>
			<ConfirmDialog
				open={confirmRemove}
				title="Uninstall prompt?"
				body={
					<>
						Remove <code>{m.name}</code> from <code>{m.source}</code>. The files
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
