// Top-level skills mode: list on the left, detail on the right.
// Dialog state (install, import) lives here so it survives selection
// changes; the dialogs themselves are added in tasks 16 and 17.

import React from "react";
import { SkillDetail } from "./SkillDetail";
import { SkillsList } from "./SkillsList";

export function SkillsMode() {
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [_installOpen, setInstallOpen] = React.useState(false);
	const [_importOpen, setImportOpen] = React.useState(false);

	return (
		<>
			<SkillsList
				selectedId={selectedId}
				onSelect={setSelectedId}
				onInstall={() => setInstallOpen(true)}
				onImport={() => setImportOpen(true)}
			/>
			<SkillDetail id={selectedId} />
		</>
	);
}
