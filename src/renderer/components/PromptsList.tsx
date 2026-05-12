// Left-pane prompts list. Mirrors SkillsList but each row exposes the
// description and (optional) argument hint on a secondary line — the two
// fields unique to prompts. Top toolbar offers Install + Import.

import { usePrompts, useSetPromptEnabled } from "../queries";

interface PromptsListProps {
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onInstall: () => void;
	onImport: () => void;
}

export function PromptsList({
	selectedId,
	onSelect,
	onInstall,
	onImport,
}: PromptsListProps) {
	const prompts = usePrompts();
	const setEnabled = useSetPromptEnabled();

	return (
		<aside className="flex w-72 flex-col surface-rail border-r border-divider">
			<div className="flex gap-2 border-b border-divider p-2">
				<button
					type="button"
					onClick={onInstall}
					className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
				>
					+ Install…
				</button>
				<button
					type="button"
					onClick={onImport}
					className="surface-row rounded px-2 py-1 text-xs hover:opacity-80"
				>
					Import from ~/.pi
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-1">
				{prompts.isLoading && (
					<div className="p-2 text-xs text-muted">Loading…</div>
				)}
				{prompts.isError && (
					<div className="p-2 text-xs text-red-300">
						{(prompts.error as Error).message}
					</div>
				)}
				{prompts.data && prompts.data.prompts.length === 0 && (
					<div className="p-2 text-xs text-muted">
						No prompts yet. Install or import from ~/.pi.
					</div>
				)}
				{prompts.data?.prompts.map((p) => (
					<div
						key={p.id}
						className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
							selectedId === p.id
								? "surface-row text-primary"
								: "text-muted hover:surface-row"
						}`}
					>
						<input
							type="checkbox"
							className="mt-1"
							checked={p.enabled}
							onChange={(e) =>
								setEnabled.mutate({ id: p.id, enabled: e.target.checked })
							}
							aria-label={`Enable ${p.name}`}
						/>
						<button
							type="button"
							onClick={() => onSelect(p.id)}
							className="flex-1 overflow-hidden text-left"
						>
							<div className="flex items-baseline gap-2">
								<span className="truncate font-medium">{p.name}</span>
								<span className="text-[10px] text-faint">{p.source}</span>
							</div>
							{p.description && (
								<div className="truncate text-xs text-muted">
									{p.description}
								</div>
							)}
							{p.argumentHint && (
								<div className="truncate text-[10px] text-faint">
									args: {p.argumentHint}
								</div>
							)}
						</button>
					</div>
				))}
			</div>
		</aside>
	);
}
