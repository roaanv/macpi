// Inline form for creating a session: cwd text input + 📁 picker + Create.
// Default cwd from settings.getDefaultCwd. Last-used cwd persists in
// localStorage to override the default for the next session.

import React from "react";
import { useDefaultCwd, useOpenFolder } from "../queries";

const LAST_CWD_KEY = "macpi.lastCwd";

export interface NewSessionFormProps {
	pending: boolean;
	error: string | null;
	onSubmit: (cwd: string) => void;
}

export function NewSessionForm({
	pending,
	error,
	onSubmit,
}: NewSessionFormProps) {
	const defaultCwd = useDefaultCwd();
	const openFolder = useOpenFolder();
	const [cwd, setCwd] = React.useState<string>("");

	// Seed the input. Priority: last-used > settings default > empty.
	React.useEffect(() => {
		if (cwd) return;
		const last = window.localStorage.getItem(LAST_CWD_KEY);
		if (last) {
			setCwd(last);
			return;
		}
		if (defaultCwd.data?.cwd) setCwd(defaultCwd.data.cwd);
	}, [cwd, defaultCwd.data]);

	const handleBrowse = async () => {
		const r = await openFolder.mutateAsync({ defaultPath: cwd || undefined });
		if (r.path) setCwd(r.path);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = cwd.trim();
		if (!trimmed) return;
		window.localStorage.setItem(LAST_CWD_KEY, trimmed);
		onSubmit(trimmed);
	};

	return (
		<form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<input
					type="text"
					placeholder="cwd"
					value={cwd}
					onChange={(e) => setCwd(e.target.value)}
					className="flex-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 outline-none"
					title={cwd}
				/>
				<button
					type="button"
					onClick={handleBrowse}
					title="Browse for folder"
					className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-600"
				>
					📁
				</button>
			</div>
			<button
				type="submit"
				disabled={pending || !cwd.trim()}
				className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
			>
				{pending ? "creating…" : "+ new session"}
			</button>
			{error && (
				<div
					className="mt-1 rounded bg-red-900/40 px-2 py-1 text-[11px] text-red-200"
					title={error}
				>
					{error}
				</div>
			)}
		</form>
	);
}
