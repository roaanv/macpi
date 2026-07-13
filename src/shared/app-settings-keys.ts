// Typed accessors and defaults for app-level (UI/UX) settings persisted in
// the settings_global table. Distinct from src/main/settings/resolver.ts +
// src/shared/settings-keys.ts which scaffold the pi-runtime cascade for a
// future per-session settings UI.

export type ThemeMode = "light" | "dark" | "auto";

export type ThemeFamily = "slate" | "carbon" | "ember" | "marine" | "punch";

// Five families ship today: the classic neutral "slate" plus four
// trend-forward palettes (each with its own type pairing) defined in
// styles.css under html[data-theme-family="…"]. Any unrecognised persisted
// theme name falls through `getThemeFamily`'s default path and becomes
// "slate" — no explicit migration table needed.

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
	httpProxy: "",
	httpsProxy: "",
	noProxy: "",
} as const;

export type AppSettingsKey = keyof typeof APP_SETTINGS_DEFAULTS;

export interface ProviderKeychainReference {
	service: string;
	managed: boolean;
}

export type ProviderKeychainReferences = Record<
	string,
	ProviderKeychainReference
>;

export function getProviderKeychainReferences(
	settings: Record<string, unknown>,
): ProviderKeychainReferences {
	const value = settings.providerKeychainReferences;
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const references: ProviderKeychainReferences = {};
	for (const [provider, candidate] of Object.entries(value)) {
		if (
			!/^[-a-zA-Z0-9._]+$/.test(provider) ||
			!candidate ||
			typeof candidate !== "object"
		)
			continue;
		const service = (candidate as Record<string, unknown>).service;
		const managed = (candidate as Record<string, unknown>).managed;
		if (typeof service !== "string" || !service.trim()) continue;
		if (typeof managed !== "boolean") continue;
		references[provider] = { service: service.trim(), managed };
	}
	return references;
}

export function setProviderKeychainReference(
	references: ProviderKeychainReferences,
	provider: string,
	reference: ProviderKeychainReference,
): ProviderKeychainReferences {
	return {
		...references,
		[provider]: { ...reference },
	};
}

export function removeProviderKeychainReference(
	references: ProviderKeychainReferences,
	provider: string,
): ProviderKeychainReferences {
	const next = { ...references };
	delete next[provider];
	return next;
}

const THEME_VALUES: ReadonlySet<ThemeMode> = new Set<ThemeMode>([
	"light",
	"dark",
	"auto",
]);
const THEME_FAMILY_VALUES: ReadonlySet<ThemeFamily> = new Set<ThemeFamily>([
	"slate",
	"carbon",
	"ember",
	"marine",
	"punch",
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

export interface ProxyValidationResult {
	ok: boolean;
	message?: string;
}

const FULL_PROXY_URL_MESSAGE =
	"Enter a full URL starting with http:// or https://";

export function getHttpProxy(settings: Record<string, unknown>): string {
	const v = settings.httpProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.httpProxy;
}

export function getHttpsProxy(settings: Record<string, unknown>): string {
	const v = settings.httpsProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.httpsProxy;
}

export function getNoProxy(settings: Record<string, unknown>): string {
	const v = settings.noProxy;
	return typeof v === "string" ? v : APP_SETTINGS_DEFAULTS.noProxy;
}

export function validateProxyUrl(value: string): ProxyValidationResult {
	const trimmed = value.trim();
	if (trimmed.length === 0) return { ok: true };

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		return {
			ok: false,
			message: FULL_PROXY_URL_MESSAGE,
		};
	}

	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return {
			ok: false,
			message: FULL_PROXY_URL_MESSAGE,
		};
	}

	if (url.username.length > 0 || url.password.length > 0) {
		return {
			ok: false,
			message: "Proxy URLs with usernames/passwords are not supported",
		};
	}

	return { ok: true };
}

export function buildProxyEnv(
	settings: Record<string, unknown>,
): Record<string, string> {
	const env: Record<string, string> = {};
	const httpProxy = getHttpProxy(settings).trim();
	const httpsProxy = getHttpsProxy(settings).trim();
	const noProxy = getNoProxy(settings).trim();

	if (validateProxyUrl(httpProxy).ok && httpProxy.length > 0) {
		env.HTTP_PROXY = httpProxy;
		env.http_proxy = httpProxy;
	}
	if (validateProxyUrl(httpsProxy).ok && httpsProxy.length > 0) {
		env.HTTPS_PROXY = httpsProxy;
		env.https_proxy = httpsProxy;
	}
	if (noProxy.length > 0) {
		env.NO_PROXY = noProxy;
		env.no_proxy = noProxy;
	}

	return env;
}

/**
 * MacPi app data root. The embedded Pi runtime uses this root's `pi-agent`
 * subdirectory; notes, auth, and model settings are MacPi-owned siblings.
 * Home-relative default (~/.macpi) is resolved at read time so we don't bake
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

export interface FavouriteModelSetting {
	provider: string;
	modelId: string;
}

export function modelRefKey(model: FavouriteModelSetting): string {
	return `${model.provider}\u0000${model.modelId}`;
}

export function getFavouriteModels(
	settings: Record<string, unknown>,
): FavouriteModelSetting[] {
	const v = settings.modelFavourites;
	if (!Array.isArray(v)) return [];
	const seen = new Set<string>();
	const favourites: FavouriteModelSetting[] = [];
	for (const item of v) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const candidate = item as Record<string, unknown>;
		if (
			typeof candidate.provider !== "string" ||
			candidate.provider.length === 0 ||
			typeof candidate.modelId !== "string" ||
			candidate.modelId.length === 0
		) {
			continue;
		}
		const favourite = {
			provider: candidate.provider,
			modelId: candidate.modelId,
		};
		const key = modelRefKey(favourite);
		if (seen.has(key)) continue;
		seen.add(key);
		favourites.push(favourite);
	}
	return favourites;
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
