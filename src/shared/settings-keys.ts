// Cascade keys + their defaults. The cascade resolver is pure and depends only on this module.

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface ModelRef {
	provider: string;
	modelId: string;
}

export interface SettingsValues {
	model: ModelRef | null;
	thinkingLevel: ThinkingLevel;
	systemPrompt: string | null;
	cwd: string | null;
	enabledSkills: string[];
	enabledExtensions: string[];
	enabledPrompts: string[];
	allowedToolNames: string[] | null;
	noTools: "all" | "builtin" | null;
}

export const DEFAULT_SETTINGS: SettingsValues = {
	model: null,
	thinkingLevel: "medium",
	systemPrompt: null,
	cwd: null,
	enabledSkills: [],
	enabledExtensions: [],
	enabledPrompts: [],
	allowedToolNames: null,
	noTools: null,
};

export type SettingsKey = keyof SettingsValues;

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];
