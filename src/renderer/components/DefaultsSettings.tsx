// Defaults category: default cwd field + 📁 picker. Stored in
// settings_global.defaultCwd; new channels with no cwd inherit it.

import React from "react";
import { getDefaultCwd, getResourceRoot } from "../../shared/app-settings-keys";
import { invoke } from "../ipc";
import {
	useDefaultCwd,
	useOpenFolder,
	useSetSetting,
	useSettings,
} from "../queries";

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

	const storedResourceRoot = getResourceRoot(
		settings,
		homeFallback.data?.cwd ?? "/",
	);
	const [resourceRootDraft, setResourceRootDraft] =
		React.useState(storedResourceRoot);

	React.useEffect(() => {
		setResourceRootDraft(storedResourceRoot);
	}, [storedResourceRoot]);

	const handleResourceRootBrowse = async () => {
		const r = await openFolder.mutateAsync({
			defaultPath: resourceRootDraft || undefined,
		});
		if (r.path) {
			setResourceRootDraft(r.path);
			setSetting.mutate({ key: "resourceRoot", value: r.path });
		}
	};

	const handleResourceRootBlur = () => {
		const trimmed = resourceRootDraft.trim();
		if (trimmed !== storedResourceRoot) {
			setSetting.mutate({ key: "resourceRoot", value: trimmed });
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<h2 className="text-base font-semibold">Defaults</h2>

			<div>
				<div className="mb-1 text-sm font-medium">Default cwd</div>
				<div className="mb-1 text-xs text-muted">
					New channels with no cwd inherit this. Sessions inherit the channel's
					cwd at creation.
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={handleBlur}
						placeholder={homeFallback.data ? homeFallback.data.cwd : "/"}
						className="flex-1 surface-row rounded px-2 py-1 text-sm"
					/>
					<button
						type="button"
						onClick={handleBrowse}
						title="Browse for folder"
						className="surface-row rounded px-2 hover:opacity-80"
					>
						📁
					</button>
				</div>
			</div>

			<div>
				<div className="mb-1 text-sm font-medium">Resource root</div>
				<div className="mb-1 text-xs text-muted">
					Where macpi stores its skills, prompts, and extensions. Isolated from
					~/.pi by default. Changes take effect for new sessions.
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={resourceRootDraft}
						onChange={(e) => setResourceRootDraft(e.target.value)}
						onBlur={handleResourceRootBlur}
						placeholder={
							homeFallback.data ? `${homeFallback.data.cwd}/.macpi` : ""
						}
						className="flex-1 surface-row rounded px-2 py-1 text-sm"
					/>
					<button
						type="button"
						onClick={handleResourceRootBrowse}
						title="Browse for folder"
						className="surface-row rounded px-2 hover:opacity-80"
					>
						📁
					</button>
				</div>
			</div>

			<div>
				<div className="mb-1 text-sm font-medium">Logs</div>
				<button
					type="button"
					onClick={() => {
						void invoke("system.openLogsFolder", {}).catch(() => {});
					}}
					className="text-blue-400 hover:underline text-sm"
				>
					Open logs folder
				</button>
			</div>
		</div>
	);
}
