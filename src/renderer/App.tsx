// Root application component that composes the three-pane shell:
// ModeRail | WorkspaceSidebar | ChatPane. Skills, Extensions, and Prompts
// have moved into the global settings dialog, so the rail now only swaps
// between Chat and Notes. Hosts SettingsApplier and dialog state.

import React from "react";
import { ChatPane } from "./components/ChatPane";
import { CreateSessionDialog } from "./components/CreateSessionDialog";
import { CreateWorkspaceDialog } from "./components/CreateWorkspaceDialog";
import { GlobalSettingsDialog } from "./components/GlobalSettingsDialog";
import { type Mode, ModeRail } from "./components/ModeRail";
import { NotesMode } from "./components/NotesMode";
import { ResizablePane } from "./components/ResizablePane";
import { SettingsApplier } from "./components/SettingsApplier";
import { ToastHost } from "./components/ToastHost";
import { WorkspaceSidebar } from "./components/WorkspaceSidebar";

export function App() {
	const [mode, setMode] = React.useState<Mode>("chat");
	const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
	const [sessionId, setSessionId] = React.useState<string | null>(null);
	const [globalSettingsOpen, setGlobalSettingsOpen] = React.useState(false);
	const [createWorkspaceOpen, setCreateWorkspaceOpen] = React.useState(false);
	const [createSessionInWorkspace, setCreateSessionInWorkspace] =
		React.useState<string | null>(null);

	return (
		<>
			<SettingsApplier />
			<div className="flex h-full surface-app">
				<ModeRail
					mode={mode}
					onSelect={setMode}
					onOpenSettings={() => setGlobalSettingsOpen(true)}
				/>
				{mode === "chat" && (
					<>
						<ResizablePane storageKey="workspaces" defaultWidth={240}>
							<WorkspaceSidebar
								selectedWorkspaceId={workspaceId}
								selectedSessionId={sessionId}
								onSelectWorkspace={(id) => {
									setWorkspaceId(id);
									setSessionId(null);
								}}
								onSelectSession={setSessionId}
								onOpenCreateWorkspace={() => setCreateWorkspaceOpen(true)}
								onOpenCreateSession={setCreateSessionInWorkspace}
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
			<CreateWorkspaceDialog
				open={createWorkspaceOpen}
				onClose={() => setCreateWorkspaceOpen(false)}
				onCreated={(id) => {
					setWorkspaceId(id);
					setSessionId(null);
				}}
			/>
			<CreateSessionDialog
				workspaceId={createSessionInWorkspace}
				onClose={() => setCreateSessionInWorkspace(null)}
				onCreated={setSessionId}
			/>
			<ToastHost />
		</>
	);
}
