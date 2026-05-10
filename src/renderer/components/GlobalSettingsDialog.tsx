// Global settings dialog: 3 categories — Theme, Font, Defaults.

import { DefaultsSettings } from "./DefaultsSettings";
import { FontSettings } from "./FontSettings";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeSettings } from "./ThemeSettings";

export interface GlobalSettingsDialogProps {
	open: boolean;
	onClose: () => void;
}

export function GlobalSettingsDialog({
	open,
	onClose,
}: GlobalSettingsDialogProps) {
	return (
		<SettingsDialog
			open={open}
			title="Settings"
			onClose={onClose}
			categories={[
				{ id: "theme", label: "Theme", render: () => <ThemeSettings /> },
				{ id: "font", label: "Font", render: () => <FontSettings /> },
				{
					id: "defaults",
					label: "Defaults",
					render: () => <DefaultsSettings />,
				},
			]}
		/>
	);
}
