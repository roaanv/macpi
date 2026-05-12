// Top-level prompts mode: list on the left, detail on the right. Reuses
// InstallSkillDialog and ImportFromPiDialog with resourceKind="prompt".

import React from "react";
import { ImportFromPiDialog } from "./dialogs/ImportFromPiDialog";
import { InstallSkillDialog } from "./dialogs/InstallSkillDialog";
import { PromptDetail } from "./PromptDetail";
import { PromptsList } from "./PromptsList";
import { ResizablePane } from "./ResizablePane";

export function PromptsMode() {
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [installOpen, setInstallOpen] = React.useState(false);
	const [importOpen, setImportOpen] = React.useState(false);
	return (
		<>
			<ResizablePane storageKey="prompts" defaultWidth={288}>
				<PromptsList
					selectedId={selectedId}
					onSelect={setSelectedId}
					onInstall={() => setInstallOpen(true)}
					onImport={() => setImportOpen(true)}
				/>
			</ResizablePane>
			<PromptDetail id={selectedId} />
			<InstallSkillDialog
				open={installOpen}
				onClose={() => setInstallOpen(false)}
				resourceKind="prompt"
			/>
			<ImportFromPiDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
				resourceKind="prompt"
			/>
		</>
	);
}
