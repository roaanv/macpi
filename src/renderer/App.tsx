// Root application component that composes the three-pane shell:
// ModeRail | ChannelSidebar | ChatPane | BranchPanel.
// Hosts SettingsApplier (writes class+CSS vars on <html>) and dialog state.

import React from "react";
import { BranchPanel } from "./components/BranchPanel";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ChatPane } from "./components/ChatPane";
import { CreateChannelDialog } from "./components/CreateChannelDialog";
import { CreateSessionDialog } from "./components/CreateSessionDialog";
import { GlobalSettingsDialog } from "./components/GlobalSettingsDialog";
import { type Mode, ModeRail } from "./components/ModeRail";
import { SettingsApplier } from "./components/SettingsApplier";

export function App() {
	const [mode, setMode] = React.useState<Mode>("chat");
	const [channelId, setChannelId] = React.useState<string | null>(null);
	const [sessionId, setSessionId] = React.useState<string | null>(null);
	const [globalSettingsOpen, setGlobalSettingsOpen] = React.useState(false);
	const [createChannelOpen, setCreateChannelOpen] = React.useState(false);
	const [createSessionInChannel, setCreateSessionInChannel] = React.useState<
		string | null
	>(null);

	return (
		<>
			<SettingsApplier />
			<div className="flex h-full surface-app font-[family-name:var(--font-family)]">
				<ModeRail
					mode={mode}
					onSelect={setMode}
					onOpenSettings={() => setGlobalSettingsOpen(true)}
				/>
				<ChannelSidebar
					selectedChannelId={channelId}
					selectedSessionId={sessionId}
					onSelectChannel={(id) => {
						setChannelId(id);
						setSessionId(null);
					}}
					onSelectSession={setSessionId}
					onOpenCreateChannel={() => setCreateChannelOpen(true)}
					onOpenCreateSession={setCreateSessionInChannel}
				/>
				<ChatPane
					piSessionId={sessionId}
					onOpenGlobalSettings={() => setGlobalSettingsOpen(true)}
				/>
				<BranchPanel />
			</div>
			<GlobalSettingsDialog
				open={globalSettingsOpen}
				onClose={() => setGlobalSettingsOpen(false)}
			/>
			<CreateChannelDialog
				open={createChannelOpen}
				onClose={() => setCreateChannelOpen(false)}
				onCreated={(id) => {
					setChannelId(id);
					setSessionId(null);
				}}
			/>
			<CreateSessionDialog
				channelId={createSessionInChannel}
				onClose={() => setCreateSessionInChannel(null)}
				onCreated={setSessionId}
			/>
		</>
	);
}
