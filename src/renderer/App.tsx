// Root application component that composes the three-pane shell:
// ModeRail | ChannelSidebar | ChatPane. Skills, Extensions, and Prompts
// have moved into the global settings dialog, so the rail now only swaps
// between Chat and Notes. Hosts SettingsApplier and dialog state.

import React from "react";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ChatPane } from "./components/ChatPane";
import { CreateChannelDialog } from "./components/CreateChannelDialog";
import { CreateSessionDialog } from "./components/CreateSessionDialog";
import { GlobalSettingsDialog } from "./components/GlobalSettingsDialog";
import { type Mode, ModeRail } from "./components/ModeRail";
import { NotesMode } from "./components/NotesMode";
import { ResizablePane } from "./components/ResizablePane";
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
				{mode === "chat" && (
					<>
						<ResizablePane storageKey="channels" defaultWidth={240}>
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
						</ResizablePane>
						<ChatPane
							piSessionId={sessionId}
							onOpenGlobalSettings={() => setGlobalSettingsOpen(true)}
							onSelectSession={setSessionId}
						/>
					</>
				)}
				{mode === "notes" && <NotesMode />}
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
