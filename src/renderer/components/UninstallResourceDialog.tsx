// Confirm-dialog wrapper for uninstalling a skill, extension, or prompt.
// All three resource kinds share the same uninstall semantics (pi removes
// the whole package on disk), so the confirm flow lives here once. Each
// resource list opens it by setting `target`; the dialog owns the inflight
// mutation state and surfaces failures inline rather than closing.

import React from "react";
import {
	useRemoveExtension,
	useRemovePrompt,
	useRemoveSkill,
} from "../queries";
import { ConfirmDialog } from "./ConfirmDialog";

export type UninstallKind = "skill" | "extension" | "prompt";

export interface UninstallTarget {
	id: string;
	name: string;
	source: string;
}

interface Props {
	kind: UninstallKind;
	target: UninstallTarget | null;
	/** Called after a successful uninstall, before the dialog closes. */
	onUninstalled?: (target: UninstallTarget) => void;
	onCancel: () => void;
}

const TITLES: Record<UninstallKind, string> = {
	skill: "Uninstall skill?",
	extension: "Uninstall extension?",
	prompt: "Uninstall prompt?",
};

export function UninstallResourceDialog({
	kind,
	target,
	onUninstalled,
	onCancel,
}: Props) {
	const removeSkill = useRemoveSkill();
	const removeExt = useRemoveExtension();
	const removePrompt = useRemovePrompt();
	const mutation =
		kind === "skill"
			? removeSkill
			: kind === "extension"
				? removeExt
				: removePrompt;

	const [error, setError] = React.useState<string | null>(null);

	const handleConfirm = async () => {
		if (!target) return;
		setError(null);
		try {
			await mutation.mutateAsync({ source: target.source });
			onUninstalled?.(target);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	const handleCancel = () => {
		setError(null);
		onCancel();
	};

	return (
		<ConfirmDialog
			open={!!target}
			title={TITLES[kind]}
			body={
				target && (
					<>
						Uninstall the package <code>{target.source}</code>
						{target.name && target.name !== target.source && (
							<>
								{" "}
								(installed <code>{target.name}</code>)
							</>
						)}
						. Pi removes the package from disk, including any other {kind}s it
						shipped. You can reinstall it any time.
						{error && <div className="mt-2 text-red-400">⚠ {error}</div>}
					</>
				)
			}
			confirmLabel={mutation.isPending ? "Uninstalling…" : "Uninstall"}
			destructive
			onConfirm={handleConfirm}
			onCancel={handleCancel}
		/>
	);
}
