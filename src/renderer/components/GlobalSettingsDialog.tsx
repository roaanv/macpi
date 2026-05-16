// Global settings dialog. Categories are grouped into three sections per the
// redesign:
//   Appearance  — Theme, Font
//   Capabilities — Skills, Extensions, Prompts (moved out of the mode rail)
//   Workspace   — Models & Auth, Defaults

import { CapabilitySettings } from "./CapabilitySettings";
import { DefaultsSettings } from "./DefaultsSettings";
import { FontSettings } from "./FontSettings";
import { ModelsAuthSettings } from "./ModelsAuthSettings";
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
				{
					id: "theme",
					label: "Theme",
					group: "Appearance",
					render: () => <ThemeSettings />,
				},
				{
					id: "font",
					label: "Font",
					group: "Appearance",
					render: () => <FontSettings />,
				},
				{
					id: "skills",
					label: "Skills",
					group: "Capabilities",
					render: () => <CapabilitySettings kind="skills" />,
				},
				{
					id: "extensions",
					label: "Extensions",
					group: "Capabilities",
					render: () => <CapabilitySettings kind="extensions" />,
				},
				{
					id: "prompts",
					label: "Prompts",
					group: "Capabilities",
					render: () => <CapabilitySettings kind="prompts" />,
				},
				{
					id: "models-auth",
					label: "Models & Auth",
					group: "Workspace",
					render: () => <ModelsAuthSettings />,
				},
				{
					id: "defaults",
					label: "Defaults",
					group: "Workspace",
					render: () => <DefaultsSettings />,
				},
			]}
		/>
	);
}
