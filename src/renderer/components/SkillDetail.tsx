// Right-pane skill detail. Manifest header + CodeEditor (markdown mode)
// + Save button + Uninstall (with confirm dialog). Tracks a local `draft`
// so the editor stays snappy and we can show an "unsaved" indicator.

import React from "react";
import { useSaveSkill, useSkillDetail } from "../queries";
import { CodeEditor } from "./CodeEditor";
import {
	UninstallResourceDialog,
	type UninstallTarget,
} from "./UninstallResourceDialog";

interface SkillDetailProps {
	id: string | null;
	onUninstalled?: () => void;
}

export function SkillDetail({ id, onUninstalled }: SkillDetailProps) {
	const detail = useSkillDetail(id);
	const save = useSaveSkill();
	const [draft, setDraft] = React.useState("");
	const [removeTarget, setRemoveTarget] =
		React.useState<UninstallTarget | null>(null);

	React.useEffect(() => {
		if (detail.data) setDraft(detail.data.body);
	}, [detail.data]);

	if (!id) {
		return (
			<section className="flex-1 surface-panel p-6 type-status text-muted">
				Select a skill on the left to view or edit it.
			</section>
		);
	}
	if (detail.isLoading) {
		return (
			<section className="flex-1 surface-panel p-6 type-status text-muted">
				Loading…
			</section>
		);
	}
	if (detail.isError || !detail.data) {
		return (
			<section className="flex-1 surface-panel p-6 type-status text-err">
				{(detail.error as Error)?.message ?? "Skill not found."}
			</section>
		);
	}

	const dirty = draft !== detail.data.body;
	const source = detail.data.manifest.source;
	const skillName = detail.data.manifest.name;

	return (
		<section className="flex flex-1 flex-col surface-panel">
			<header className="border-b border-divider p-3">
				<div className="type-section-heading">{skillName}</div>
				<div className="type-metadata type-technical-wrap">
					{source} · {detail.data.manifest.relativePath}
				</div>
			</header>
			<CodeEditor value={draft} onChange={setDraft} language="markdown" />
			<footer className="flex items-center justify-end gap-2 border-t border-divider p-2">
				{dirty && <span className="type-status text-warn">• unsaved</span>}
				<button
					type="button"
					onClick={() => setRemoveTarget({ id, name: skillName, source })}
					className="mr-auto rounded px-3 py-1 type-control text-err hover:surface-err-soft"
				>
					Uninstall…
				</button>
				<button
					type="button"
					disabled={!dirty || save.isPending}
					onClick={() => save.mutate({ id, body: draft })}
					className="surface-row rounded px-3 py-1 type-control hover:opacity-80 disabled:opacity-40"
				>
					{save.isPending ? "Saving…" : "Save"}
				</button>
			</footer>
			<UninstallResourceDialog
				kind="skill"
				target={removeTarget}
				onUninstalled={() => {
					setRemoveTarget(null);
					onUninstalled?.();
				}}
				onCancel={() => setRemoveTarget(null)}
			/>
		</section>
	);
}
