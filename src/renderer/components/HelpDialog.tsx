// Modal listing all available slash commands grouped by category. Opened
// by /help. Closes on Esc, on backdrop click, or via the close button.

import React from "react";
import type { SlashCommand } from "../slash/types";

interface HelpDialogProps {
	open: boolean;
	onClose: () => void;
	commands: SlashCommand[];
}

const GROUP_LABEL: Record<SlashCommand["kind"], string> = {
	builtin: "Built-in",
	template: "Prompt Templates",
	skill: "Skills",
};

export function HelpDialog({ open, onClose, commands }: HelpDialogProps) {
	React.useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const groups: Record<SlashCommand["kind"], SlashCommand[]> = {
		builtin: [],
		template: [],
		skill: [],
	};
	for (const c of commands) groups[c.kind].push(c);
	for (const k of Object.keys(groups) as SlashCommand["kind"][]) {
		groups[k].sort((a, b) => a.name.localeCompare(b.name));
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; keyboard close handled via Escape listener
		<div
			className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
			onClick={onClose}
			onKeyDown={() => undefined}
			role="presentation"
		>
			<div
				className="surface-panel border-divider max-h-[80vh] w-[640px] max-w-[90vw] overflow-auto rounded border p-4 text-sm text-primary shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Slash Commands"
			>
				<div className="flex items-center">
					<h2 className="font-semibold">Slash Commands</h2>
					<button
						type="button"
						onClick={onClose}
						className="ml-auto rounded px-2 py-1 hover:surface-row"
						aria-label="Close"
					>
						✕
					</button>
				</div>
				{(Object.keys(groups) as SlashCommand["kind"][]).map((kind) =>
					groups[kind].length > 0 ? (
						<section key={kind} className="mt-3">
							<h3 className="mb-1 text-xs text-muted">{GROUP_LABEL[kind]}</h3>
							<ul className="space-y-0.5">
								{groups[kind].map((c) => (
									<li
										key={`${c.kind}:${c.name}`}
										className="flex items-baseline gap-2 px-1 py-0.5"
									>
										<span className="font-semibold">/{c.name}</span>
										{c.argumentHint && (
											<span className="text-muted">{c.argumentHint}</span>
										)}
										<span className="ml-auto truncate text-muted">
											{c.description}
										</span>
									</li>
								))}
							</ul>
						</section>
					) : null,
				)}
			</div>
		</div>
	);
}
