// Modal with a source input and a live progress area. While the dialog
// is open, package.progress PiEvents are appended to a scrolling log.
// Closes automatically on successful install; on error, leaves the
// progress visible so the user can read the failure.

import React from "react";
import { onPiEvent } from "../../ipc";
import {
	useInstallExtension,
	useInstallPrompt,
	useInstallSkill,
} from "../../queries";

interface InstallSkillDialogProps {
	open: boolean;
	onClose: () => void;
	resourceKind?: "skill" | "extension" | "prompt";
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
	const installPrompt = useInstallPrompt();
	const install =
		resourceKind === "extension"
			? installExtension
			: resourceKind === "prompt"
				? installPrompt
				: installSkill;

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
				className="max-w-[calc(100vw-2rem)] surface-panel flex w-[480px] flex-col gap-3 rounded p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => undefined}
				role="dialog"
				aria-modal="true"
				aria-label={`Install ${resourceKind}`}
			>
				<div className="type-section-heading">Install {resourceKind}</div>
				<input
					type="text"
					value={source}
					onChange={(e) => setSource(e.target.value)}
					placeholder="npm package name, git URL, or local path"
					className="surface-row rounded px-2 py-1 type-code type-control type-technical-wrap"
				/>
				{progress.length > 0 && (
					<div className="max-h-32 overflow-y-auto rounded surface-row p-2 type-metadata text-muted">
						{progress.map((p, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: progress lines have no stable id
							<div key={i}>
								<span className="mr-2 type-overline">{p.phase}</span>
								<span className="type-code type-technical-wrap">
									{p.message}
								</span>
							</div>
						))}
					</div>
				)}
				{install.isError && (
					<div className="type-status type-technical-wrap text-err">
						{(install.error as Error).message}
					</div>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						disabled={install.isPending}
						className="surface-row rounded px-3 py-1 hover:opacity-80 disabled:opacity-40 type-control"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleInstall}
						disabled={!source.trim() || install.isPending}
						className="surface-row rounded px-3 py-1 hover:opacity-80 disabled:opacity-40 type-control"
					>
						{install.isPending ? "Installing…" : "Install"}
					</button>
				</div>
			</div>
		</div>
	);
}
