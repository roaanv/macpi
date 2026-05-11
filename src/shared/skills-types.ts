// Renderer-safe shapes for skills surfaced over IPC.
// Derived from pi's `Skill` type but trimmed to what the UI needs.

export interface SkillSummary {
	id: string;
	name: string;
	source: string;
	relativePath: string;
	enabled: boolean;
}

export interface SkillManifest {
	name: string;
	source: string;
	relativePath: string;
	version?: string;
}
