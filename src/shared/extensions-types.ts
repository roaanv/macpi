// Renderer-safe shapes for extensions surfaced over IPC.
// Derived from pi's `Extension` type but trimmed to UI needs.

export interface ExtensionSummary {
	id: string;
	name: string;
	source: string;
	relativePath: string;
	enabled: boolean;
}

export interface ExtensionManifest {
	name: string;
	source: string;
	relativePath: string;
	path: string; // absolute entry file path on disk
}

export interface ExtensionLoadError {
	path: string;
	error: string;
}

export interface ExtensionDiagnostic {
	severity: "error" | "warn" | "info";
	line: number;
	column: number;
	message: string;
	rule?: string;
}
