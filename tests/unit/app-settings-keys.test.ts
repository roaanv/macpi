import { describe, expect, it } from "vitest";
import {
	APP_SETTINGS_DEFAULTS,
	buildProxyEnv,
	getDefaultCwd,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getHttpProxy,
	getHttpsProxy,
	getNoProxy,
	getResourceEnabled,
	getResourceRoot,
	getSelectedModel,
	getTheme,
	getThemeFamily,
	validateProxyUrl,
} from "../../src/shared/app-settings-keys";

describe("app-settings-keys", () => {
	it("getTheme returns default 'auto' when unset", () => {
		expect(getTheme({})).toBe("auto");
	});

	it("getTheme returns the stored value when valid", () => {
		expect(getTheme({ theme: "light" })).toBe("light");
		expect(getTheme({ theme: "dark" })).toBe("dark");
		expect(getTheme({ theme: "auto" })).toBe("auto");
	});

	it("getTheme falls back to 'auto' for invalid value", () => {
		expect(getTheme({ theme: "invalid" })).toBe("auto");
		expect(getTheme({ theme: 123 })).toBe("auto");
	});

	it("getFontFamily returns default when unset", () => {
		expect(getFontFamily({})).toBe(APP_SETTINGS_DEFAULTS.fontFamily);
	});

	it("getFontFamily returns the stored value", () => {
		expect(getFontFamily({ fontFamily: "Inter" })).toBe("Inter");
	});

	it("getFontFamilyMono returns default when unset", () => {
		expect(getFontFamilyMono({})).toBe(APP_SETTINGS_DEFAULTS.fontFamilyMono);
	});

	it("getFontSize returns the per-region default when unset", () => {
		expect(getFontSize({}, "sidebar")).toBe(13);
		expect(getFontSize({}, "chatAssistant")).toBe(14);
		expect(getFontSize({}, "codeBlock")).toBe(13);
	});

	it("getFontSize returns the stored value when set", () => {
		expect(getFontSize({ "fontSize.sidebar": 16 }, "sidebar")).toBe(16);
	});

	it("getFontSize clamps non-numeric values to default", () => {
		expect(getFontSize({ "fontSize.sidebar": "huge" }, "sidebar")).toBe(13);
	});

	it("getDefaultCwd returns empty string when unset", () => {
		expect(getDefaultCwd({})).toBe("");
	});

	it("getDefaultCwd returns the stored value", () => {
		expect(getDefaultCwd({ defaultCwd: "/Users/x" })).toBe("/Users/x");
	});
});

describe("selected model setting", () => {
	it("returns null when unset", () => {
		expect(getSelectedModel({})).toBeNull();
	});

	it("returns provider/modelId when valid", () => {
		expect(
			getSelectedModel({
				selectedModel: { provider: "anthropic", modelId: "claude" },
			}),
		).toEqual({
			provider: "anthropic",
			modelId: "claude",
		});
	});

	it("rejects malformed values", () => {
		expect(
			getSelectedModel({ selectedModel: { provider: "anthropic" } }),
		).toBeNull();
		expect(getSelectedModel({ selectedModel: "anthropic/claude" })).toBeNull();
	});
});

describe("resourceRoot setting", () => {
	it("defaults to ~/.macpi when missing or non-string", () => {
		expect(getResourceRoot({}, "/Users/test")).toBe("/Users/test/.macpi");
		expect(getResourceRoot({ resourceRoot: 5 }, "/Users/test")).toBe(
			"/Users/test/.macpi",
		);
	});
	it("returns the stored string value when valid", () => {
		expect(
			getResourceRoot({ resourceRoot: "/custom/path" }, "/Users/test"),
		).toBe("/custom/path");
	});
	it("APP_SETTINGS_DEFAULTS does not statically embed a home path", () => {
		// Defaults are home-relative at read time, not at module load.
		expect(
			(APP_SETTINGS_DEFAULTS as Record<string, unknown>).resourceRoot,
		).toBeUndefined();
	});
});

describe("themeFamily setting", () => {
	it("returns 'slate' default when unset", () => {
		expect(getThemeFamily({})).toBe("slate");
	});

	it("accepts 'slate'", () => {
		expect(getThemeFamily({ themeFamily: "slate" })).toBe("slate");
	});

	it("collapses every retired family to 'slate'", () => {
		// Retired aliases (was distinct family) AND legacy aliases (pre-redesign
		// names) all reduce to slate via the default fallback — no explicit
		// migration table is needed.
		for (const v of [
			"linen",
			"pebble",
			"sage",
			"graphite",
			"nocturne",
			"sunrise",
			"meadow",
			"catppuccin",
		]) {
			expect(getThemeFamily({ themeFamily: v })).toBe("slate");
		}
	});

	it("falls back to default for unknown values", () => {
		expect(getThemeFamily({ themeFamily: "unicorn" })).toBe("slate");
		expect(getThemeFamily({ themeFamily: 7 })).toBe("slate");
	});
});

describe("resourceEnabled setting", () => {
	it("returns empty map when missing", () => {
		expect(getResourceEnabled({})).toEqual({});
	});
	it("returns the stored map", () => {
		const map = { "skill:local:foo.md": true, "skill:local:bar.md": false };
		expect(getResourceEnabled({ resourceEnabled: map })).toEqual(map);
	});
	it("guards against non-object values", () => {
		expect(getResourceEnabled({ resourceEnabled: "nope" })).toEqual({});
		expect(getResourceEnabled({ resourceEnabled: null })).toEqual({});
	});
});

describe("proxy settings", () => {
	it("defaults proxy settings to empty strings", () => {
		expect(APP_SETTINGS_DEFAULTS.httpProxy).toBe("");
		expect(APP_SETTINGS_DEFAULTS.httpsProxy).toBe("");
		expect(APP_SETTINGS_DEFAULTS.noProxy).toBe("");
	});

	it("reads stored proxy setting strings", () => {
		expect(getHttpProxy({ httpProxy: "http://proxy.example.com:8080" })).toBe(
			"http://proxy.example.com:8080",
		);
		expect(
			getHttpsProxy({ httpsProxy: "https://secure.example.com:8443" }),
		).toBe("https://secure.example.com:8443");
		expect(getNoProxy({ noProxy: "localhost,127.0.0.1" })).toBe(
			"localhost,127.0.0.1",
		);
	});

	it("falls back to empty strings for malformed stored proxy values", () => {
		expect(getHttpProxy({ httpProxy: 5 })).toBe("");
		expect(getHttpsProxy({ httpsProxy: null })).toBe("");
		expect(getNoProxy({ noProxy: ["localhost"] })).toBe("");
	});

	it("accepts empty and full http(s) proxy URLs", () => {
		expect(validateProxyUrl("")).toEqual({ ok: true });
		expect(validateProxyUrl(" http://proxy.example.com:8080 ")).toEqual({
			ok: true,
		});
		expect(validateProxyUrl("https://proxy.example.com:8443")).toEqual({
			ok: true,
		});
	});

	it("rejects proxy URLs without http(s) protocol", () => {
		expect(validateProxyUrl("proxy.example.com:8080")).toEqual({
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		});
		expect(validateProxyUrl("socks5://proxy.example.com:1080")).toEqual({
			ok: false,
			message: "Enter a full URL starting with http:// or https://",
		});
	});

	it("rejects proxy URLs with auth", () => {
		expect(validateProxyUrl("http://user:pass@proxy.example.com:8080")).toEqual(
			{
				ok: false,
				message: "Proxy URLs with usernames/passwords are not supported",
			},
		);
	});

	it("builds upper and lower case env overrides for non-empty proxy settings", () => {
		expect(
			buildProxyEnv({
				httpProxy: "http://proxy.example.com:8080",
				httpsProxy: "http://secure-proxy.example.com:8080",
				noProxy: "localhost,127.0.0.1",
			}),
		).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
			HTTPS_PROXY: "http://secure-proxy.example.com:8080",
			https_proxy: "http://secure-proxy.example.com:8080",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});
	});

	it("omits empty proxy env settings", () => {
		expect(
			buildProxyEnv({
				httpProxy: "",
				httpsProxy: "https://proxy.example.com:8443",
				noProxy: "",
			}),
		).toEqual({
			HTTPS_PROXY: "https://proxy.example.com:8443",
			https_proxy: "https://proxy.example.com:8443",
		});
	});

	it("trims proxy env values and omits whitespace-only settings", () => {
		expect(
			buildProxyEnv({
				httpProxy: " http://proxy.example.com:8080 ",
				httpsProxy: " \t ",
				noProxy: " localhost,127.0.0.1\n",
			}),
		).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});
	});

	it("silently omits invalid persisted proxy URLs while preserving valid ones", () => {
		expect(
			buildProxyEnv({
				httpProxy: "proxy.example.com:8080",
				httpsProxy: "https://secure-proxy.example.com:8443",
				noProxy: "localhost,127.0.0.1",
			}),
		).toEqual({
			HTTPS_PROXY: "https://secure-proxy.example.com:8443",
			https_proxy: "https://secure-proxy.example.com:8443",
			NO_PROXY: "localhost,127.0.0.1",
			no_proxy: "localhost,127.0.0.1",
		});

		expect(
			buildProxyEnv({
				httpProxy: "http://proxy.example.com:8080",
				httpsProxy: "socks5://secure-proxy.example.com:1080",
			}),
		).toEqual({
			HTTP_PROXY: "http://proxy.example.com:8080",
			http_proxy: "http://proxy.example.com:8080",
		});
	});
});
