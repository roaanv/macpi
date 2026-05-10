// Root application component that composes the three-pane shell:
// ModeRail | ChannelSidebar | ChatPane | BranchPanel

import React from "react";
import { BranchPanel } from "./components/BranchPanel";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { ChatPane } from "./components/ChatPane";
import { type Mode, ModeRail } from "./components/ModeRail";

export function App() {
	const [mode, setMode] = React.useState<Mode>("chat");
	const [channelId, setChannelId] = React.useState<string | null>(null);
	const [sessionId, setSessionId] = React.useState<string | null>(null);

	return (
		<div className="flex h-full">
			<ModeRail mode={mode} onSelect={setMode} />
			<ChannelSidebar
				selectedChannelId={channelId}
				selectedSessionId={sessionId}
				onSelectChannel={(id) => {
					setChannelId(id);
					setSessionId(null);
				}}
				onSelectSession={setSessionId}
			/>
			<ChatPane piSessionId={sessionId} />
			<BranchPanel />
		</div>
	);
}
