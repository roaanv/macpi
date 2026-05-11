// Collapsible panel that shows Biome lint diagnostics below the code editor.
// Auto-collapses when there are no errors; expands when errors are present.

import React from "react";
import type { ExtensionDiagnostic } from "../../shared/extensions-types";

interface DiagnosticsPanelProps {
	diagnostics: ExtensionDiagnostic[];
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
	const [collapsed, setCollapsed] = React.useState(
		diagnostics.every((d) => d.severity !== "error"),
	);
	if (diagnostics.length === 0) return null;

	const counts: Record<string, number> = {};
	for (const d of diagnostics) {
		counts[d.severity] = (counts[d.severity] ?? 0) + 1;
	}

	return (
		<div className="border-t border-divider text-xs">
			<button
				type="button"
				onClick={() => setCollapsed((c) => !c)}
				className="flex w-full items-center gap-2 px-2 py-1 text-left surface-row hover:opacity-80"
			>
				<span>{collapsed ? "▸" : "▾"}</span>
				<span className="font-semibold">Diagnostics</span>
				{counts.error && (
					<span className="text-red-300">
						{counts.error} error{counts.error > 1 && "s"}
					</span>
				)}
				{counts.warn && (
					<span className="text-amber-300">
						{counts.warn} warning{counts.warn > 1 && "s"}
					</span>
				)}
			</button>
			{!collapsed && (
				<div className="max-h-40 overflow-y-auto p-2">
					{diagnostics.map((d, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: diagnostic rows have no stable id
							key={i}
							className={`flex gap-2 px-1 py-0.5 ${d.severity === "error" ? "text-red-300" : d.severity === "warn" ? "text-amber-300" : "text-muted"}`}
						>
							<span className="font-mono text-[10px]">
								{d.line}:{d.column}
							</span>
							<span className="flex-1">{d.message}</span>
							{d.rule && (
								<span className="text-[10px] text-muted">{d.rule}</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
