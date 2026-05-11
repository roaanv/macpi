// src/renderer/components/ExtensionsMode.tsx
import React from "react";
import { ImportFromPiDialog } from "./dialogs/ImportFromPiDialog";
import { InstallSkillDialog } from "./dialogs/InstallSkillDialog";
import { ExtensionDetail } from "./ExtensionDetail";
import { ExtensionsList } from "./ExtensionsList";

// We reuse the install dialog (works for any source via pi's package
// manager). The shape is the same — only the source string differs.
// For phase 2 we add an "extensions" tag to differentiate refresh behavior
// (next task wires this).

export function ExtensionsMode() {
	const [selectedId, setSelectedId] = React.useState<string | null>(null);
	const [installOpen, setInstallOpen] = React.useState(false);
	const [importOpen, setImportOpen] = React.useState(false);
	return (
		<>
			<ExtensionsList
				selectedId={selectedId}
				onSelect={setSelectedId}
				onInstall={() => setInstallOpen(true)}
				onImport={() => setImportOpen(true)}
			/>
			<ExtensionDetail id={selectedId} />
			<InstallSkillDialog
				open={installOpen}
				onClose={() => setInstallOpen(false)}
				resourceKind="extension"
			/>
			<ImportFromPiDialog
				open={importOpen}
				onClose={() => setImportOpen(false)}
			/>
		</>
	);
}
