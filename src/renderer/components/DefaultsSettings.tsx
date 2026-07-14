// Defaults category: default cwd field + 📁 picker. Stored in
// settings_global.defaultCwd; new workspaces with no cwd inherit it.

import React from "react";
import { getDefaultCwd } from "../../shared/app-settings-keys";
import { invoke } from "../ipc";
import {
	useDefaultCwd,
	useOpenFolder,
	useSetSetting,
	useSettings,
} from "../queries";
import { DefaultModelSelector } from "./DefaultModelSelector";

export function DefaultsSettings() {
	const { data } = useSettings();
	const setSetting = useSetSetting();
	const openFolder = useOpenFolder();
	const homeFallback = useDefaultCwd();
	const settings = data?.settings ?? {};
	const stored = getDefaultCwd(settings);
	const [draft, setDraft] = React.useState(stored);

	React.useEffect(() => {
		setDraft(stored);
	}, [stored]);

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: draft || undefined });
		if (r.path) {
			setDraft(r.path);
			setSetting.mutate({ key: "defaultCwd", value: r.path });
		}
	};

	const handleBlur = () => {
		const trimmed = draft.trim();
		if (trimmed !== stored) {
			setSetting.mutate({ key: "defaultCwd", value: trimmed });
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<h2 className="type-section-heading">Defaults</h2>

			<div>
				<div className="mb-1 type-label">Default cwd</div>
				<div className="mb-1 type-metadata text-muted">
					New workspaces with no cwd inherit this. Sessions inherit the
					workspace's cwd at creation.
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={handleBlur}
						placeholder={homeFallback.data ? homeFallback.data.cwd : "/"}
						className="flex-1 surface-row rounded px-2 py-1 type-code type-control type-ellipsis type-technical-wrap"
					/>
					<button
						type="button"
						onClick={handleBrowse}
						title="Browse for folder"
						className="surface-row rounded px-2 hover:opacity-80 type-control"
					>
						📁
					</button>
				</div>
			</div>

			<DefaultModelSelector />

			<div>
				<div className="mb-1 type-label">Pi environment</div>
				<div className="mb-1 type-metadata text-muted">
					MacPi stores its Pi runtime state inside the MacPi resource root at{" "}
					<span className="type-code type-technical-wrap">pi-agent</span>.
					Packages, skills, prompts, sessions, and extensions are sandboxed from
					the Pi CLI.
				</div>
			</div>

			<div>
				<div className="mb-1 type-label">Logs</div>
				<button
					type="button"
					onClick={() => {
						void invoke("system.openLogsFolder", {}).catch(() => {});
					}}
					className="type-control text-accent hover:underline"
				>
					Open logs folder
				</button>
			</div>
		</div>
	);
}
