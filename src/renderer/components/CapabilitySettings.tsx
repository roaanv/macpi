// Generic list-and-detail wrapper used to mount the Skills, Extensions, and
// Prompts categories inside the Settings dialog. Each capability already ships
// its own list + detail components — this wraps them in a two-pane layout
// without the ResizablePane chrome we used when they were standalone modes.

import React from "react";
import { ImportFromPiDialog } from "./dialogs/ImportFromPiDialog";
import { InstallSkillDialog } from "./dialogs/InstallSkillDialog";
import { ExtensionDetail } from "./ExtensionDetail";
import { ExtensionsList } from "./ExtensionsList";
import { PromptDetail } from "./PromptDetail";
import { PromptsList } from "./PromptsList";
import { SkillDetail } from "./SkillDetail";
import { SkillsList } from "./SkillsList";

type Kind = "skills" | "extensions" | "prompts";

const RESOURCE_KIND: Record<Kind, "skill" | "extension" | "prompt"> = {
	skills: "skill",
	extensions: "extension",
	prompts: "prompt",
};

export function CapabilitySettings({ kind }: { kind: Kind }) {
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [installOpen, setInstallOpen] = React.useState(false);
	const [importOpen, setImportOpen] = React.useState(false);
	const resourceKind = RESOURCE_KIND[kind];

	const listProps = {
		selectedId,
		onSelect: setSelectedId,
		onInstall: () => setInstallOpen(true),
		onImport: () => setImportOpen(true),
	};

	return (
		<div className="-m-6 flex h-full min-h-0">
			<div className="w-72 min-w-[240px] shrink-0">
				{kind === "skills" && <SkillsList {...listProps} />}
				{kind === "extensions" && <ExtensionsList {...listProps} />}
				{kind === "prompts" && <PromptsList {...listProps} />}
			</div>
			<div className="flex min-w-0 flex-1 flex-col">
				{kind === "skills" && <SkillDetail id={selectedId} />}
				{kind === "extensions" && <ExtensionDetail id={selectedId} />}
				{kind === "prompts" && <PromptDetail id={selectedId} />}
			</div>
			<InstallSkillDialog
				open={installOpen}
				onClose={() => setInstallOpen(false)}
				resourceKind={resourceKind}
			/>
			<ImportFromPiDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
				resourceKind={resourceKind}
			/>
		</div>
	);
}
