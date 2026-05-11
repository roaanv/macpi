// Right-pane skill detail. Manifest header + CodeMirror markdown
// editor + Save button. Tracks a local `draft` so the editor stays
// snappy and we can show an "unsaved" indicator.

import React from "react";
import { useSaveSkill, useSkillDetail } from "../queries";
import { MarkdownEditor } from "./MarkdownEditor";

interface SkillDetailProps {
	id: string | null;
}

export function SkillDetail({ id }: SkillDetailProps) {
	const detail = useSkillDetail(id);
	const save = useSaveSkill();
	const [draft, setDraft] = React.useState("");

	React.useEffect(() => {
		if (detail.data) setDraft(detail.data.body);
	}, [detail.data]);

	if (!id) {
		return (
			<section className="flex-1 surface-panel p-6 text-sm text-muted">
				Select a skill on the left to view or edit it.
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
				{(detail.error as Error)?.message ?? "Skill not found."}
			</section>
		);
	}

	const dirty = draft !== detail.data.body;

	return (
		<section className="flex flex-1 flex-col surface-panel">
			<header className="border-b border-divider p-3">
				<div className="text-sm font-semibold text-primary">
					{detail.data.manifest.name}
				</div>
				<div className="text-xs text-muted">
					{detail.data.manifest.source} · {detail.data.manifest.relativePath}
				</div>
			</header>
			<MarkdownEditor value={draft} onChange={setDraft} />
			<footer className="flex items-center justify-end gap-2 border-t border-divider p-2">
				{dirty && <span className="text-xs text-amber-300">• unsaved</span>}
				<button
					type="button"
					disabled={!dirty || save.isPending}
					onClick={() => save.mutate({ id, body: draft })}
					className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
				>
					{save.isPending ? "Saving…" : "Save"}
				</button>
			</footer>
		</section>
	);
}
