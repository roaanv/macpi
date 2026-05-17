// Typed accessors and defaults for app-level (UI/UX) settings persisted in
// the settings_global table. Distinct from src/main/settings/resolver.ts +
// src/shared/settings-keys.ts which scaffold the pi-runtime cascade for a
// future per-session settings UI.

export type ThemeMode = "light" | "dark" | "auto";

export type ThemeFamily = "slate";

// Slate is the only surviving family. Any persisted theme name (legacy
// "sunrise"/"meadow"/"catppuccin" or the retired "linen"/"pebble"/"sage"/
// "graphite"/"nocturne") falls through `getThemeFamily`'s default path and
// becomes "slate" — no explicit migration table needed.

export type FontSizeRegion =
	| "sidebar"
	| "chatAssistant"
	| "chatUser"
	| "composer"
	| "codeBlock";

export const APP_SETTINGS_DEFAULTS = {
	theme: "auto" as ThemeMode,
	themeFamily: "slate" as ThemeFamily,
	fontFamily: "",
	fontFamilyMono: "",
	"fontSize.sidebar": 13,
	"fontSize.chatAssistant": 14,
	"fontSize.chatUser": 14,
	"fontSize.composer": 14,
	"fontSize.codeBlock": 13,
	defaultCwd: "",
} as const;

export type AppSettingsKey = keyof typeof APP_SETTINGS_DEFAULTS;

const THEME_VALUES: ReadonlySet<ThemeMode> = new Set<ThemeMode>([
	"light",
	"dark",
	"auto",
]);
const THEME_FAMILY_VALUES: ReadonlySet<ThemeFamily> = new Set<ThemeFamily>([
	"slate",
]);

export function getTheme(settings: Record<string, unknown>): ThemeMode {
	const v = settings.theme;
	if (typeof v === "string" && THEME_VALUES.has(v as ThemeMode)) {
		return v as ThemeMode;
	}
	return APP_SETTINGS_DEFAULTS.theme;
}

export function getThemeFamily(settings: Record<string, unknown>): ThemeFamily {
	const v = settings.themeFamily;
	if (typeof v === "string" && THEME_FAMILY_VALUES.has(v as ThemeFamily)) {
		return v as ThemeFamily;
	}
	return APP_SETTINGS_DEFAULTS.themeFamily;
}

export function getFontFamily(settings: Record<string, unknown>): string {
	const v = settings.fontFamily;
	return typeof v === "string" && v.length > 0
		? v
		: APP_SETTINGS_DEFAULTS.fontFamily;
}

export function getFontFamilyMono(settings: Record<string, unknown>): string {
	const v = settings.fontFamilyMono;
	return typeof v === "string" && v.length > 0
		? v
		: APP_SETTINGS_DEFAULTS.fontFamilyMono;
}

const FONT_SIZE_KEY: Record<FontSizeRegion, AppSettingsKey> = {
	sidebar: "fontSize.sidebar",
	chatAssistant: "fontSize.chatAssistant",
	chatUser: "fontSize.chatUser",
	composer: "fontSize.composer",
	codeBlock: "fontSize.codeBlock",
};

export function getFontSize(
	settings: Record<string, unknown>,
	region: FontSizeRegion,
): number {
	const key = FONT_SIZE_KEY[region];
	const v = settings[key];
	return typeof v === "number" && Number.isFinite(v)
		? v
		: (APP_SETTINGS_DEFAULTS[key] as number);
}

export function getDefaultCwd(settings: Record<string, unknown>): string {
	const v = settings.defaultCwd;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.defaultCwd;
}

/**
 * Resource root — where pi's loader/package-manager are pointed. Home-relative
 * default (~/.macpi) is resolved at read time so we don't bake the path into
 * the defaults map.
 */
export function getResourceRoot(
	settings: Record<string, unknown>,
	homeDir: string,
): string {
	const v = settings.resourceRoot;
	if (typeof v === "string" && v.length > 0) return v;
	return `${homeDir}/.macpi`;
}

export interface SelectedModelSetting {
	provider: string;
	modelId: string;
}

export function getSelectedModel(
	settings: Record<string, unknown>,
): SelectedModelSetting | null {
	const v = settings.selectedModel;
	if (!v || typeof v !== "object" || Array.isArray(v)) return null;
	const candidate = v as Record<string, unknown>;
	return typeof candidate.provider === "string" &&
		candidate.provider.length > 0 &&
		typeof candidate.modelId === "string" &&
		candidate.modelId.length > 0
		? { provider: candidate.provider, modelId: candidate.modelId }
		: null;
}

/**
 * Global enabled map for resources. Missing entry = enabled.
 * Keyed by `<type>:<source>:<relative-path>`.
 */
export function getResourceEnabled(
	settings: Record<string, unknown>,
): Record<string, boolean> {
	const v = settings.resourceEnabled;
	if (v && typeof v === "object" && !Array.isArray(v)) {
		return v as Record<string, boolean>;
	}
	return {};
}
