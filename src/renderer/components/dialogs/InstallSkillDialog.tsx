// Modal with a source input and a live progress area. While the dialog
// is open, package.progress PiEvents are appended to a scrolling log.
// Closes automatically on successful install; on error, leaves the
// progress visible so the user can read the failure.

import React from "react";
import { onPiEvent } from "../../ipc";
import { useInstallExtension, useInstallSkill } from "../../queries";

interface InstallSkillDialogProps {
	open: boolean;
	onClose: () => void;
	resourceKind?: "skill" | "extension";
}

interface ProgressLine {
	phase: string;
	message: string;
}

export function InstallSkillDialog({
	open,
	onClose,
	resourceKind = "skill",
}: InstallSkillDialogProps) {
	const [source, setSource] = React.useState("");
	const [progress, setProgress] = React.useState<ProgressLine[]>([]);
	const installSkill = useInstallSkill();
	const installExtension = useInstallExtension();
	const install =
		resourceKind === "extension" ? installExtension : installSkill;

	React.useEffect(() => {
		if (!open) return;
		return onPiEvent((raw) => {
			const e = raw as {
				type: string;
				phase?: string;
				action?: string;
				source?: string;
				message?: string;
			};
			if (e.type !== "package.progress") return;
			setProgress((prev) => [
				...prev,
				{
					phase: e.phase ?? "",
					message: `${e.action ?? "?"} ${e.source ?? ""}${e.message ? ` — ${e.message}` : ""}`,
				},
			]);
		});
	}, [open]);

	if (!open) return null;

	const handleInstall = () => {
		setProgress([]);
		install.mutate(
			{ source: source.trim() },
			{
				onSuccess: () => {
					setSource("");
					onClose();
				},
			},
		);
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel flex w-[480px] flex-col gap-3 rounded p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={`Install ${resourceKind}`}
			>
				<div className="text-sm font-semibold">Install {resourceKind}</div>
				<input
					type="text"
					value={source}
					onChange={(e) => setSource(e.target.value)}
					placeholder="npm package name, git URL, or local path"
					className="surface-row rounded px-2 py-1 text-sm"
				/>
				{progress.length > 0 && (
					<div className="max-h-32 overflow-y-auto rounded surface-row p-2 text-xs text-muted">
						{progress.map((p, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: progress lines have no stable id
							<div key={i}>
								<span className="mr-2 text-[10px] uppercase tracking-widest">
									{p.phase}
								</span>
								{p.message}
							</div>
						))}
					</div>
				)}
				{install.isError && (
					<div className="text-xs text-red-300">
						{(install.error as Error).message}
					</div>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						disabled={install.isPending}
						className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleInstall}
						disabled={!source.trim() || install.isPending}
						className="surface-row rounded px-3 py-1 text-xs hover:opacity-80 disabled:opacity-40"
					>
						{install.isPending ? "Installing…" : "Install"}
					</button>
				</div>
			</div>
		</div>
	);
}
