// Renderer-safe shapes for prompts surfaced over IPC.
// Derived from pi's `PromptTemplate` type. Carries description and the
// optional argument hint (unique to prompts; skills don't have these),
// so the UI list can show them as secondary lines.

export interface PromptSummary {
	id: string;
	name: string;
	description: string;
	argumentHint?: string;
	source: string;
	relativePath: string;
	enabled: boolean;
}

export interface PromptManifest {
	name: string;
	description: string;
	argumentHint?: string;
	source: string;
	relativePath: string;
}

export interface PromptLoadError {
	path: string;
	error: string;
}
