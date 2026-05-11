// Top-level skills mode: list on the left, detail on the right.
// Dialog state (install, import) lives here so it survives selection
// changes; the dialogs themselves are added in tasks 16 and 17.

import React from "react";
import { ImportFromPiDialog } from "./dialogs/ImportFromPiDialog";
import { InstallSkillDialog } from "./dialogs/InstallSkillDialog";
import { SkillDetail } from "./SkillDetail";
import { SkillsList } from "./SkillsList";

export function SkillsMode() {
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [installOpen, setInstallOpen] = React.useState(false);
	const [importOpen, setImportOpen] = React.useState(false);

	return (
		<>
			<SkillsList
				selectedId={selectedId}
				onSelect={setSelectedId}
				onInstall={() => setInstallOpen(true)}
				onImport={() => setImportOpen(true)}
			/>
			<SkillDetail id={selectedId} />
			<InstallSkillDialog
				open={installOpen}
				onClose={() => setInstallOpen(false)}
			/>
			<ImportFromPiDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
			/>
		</>
	);
}
