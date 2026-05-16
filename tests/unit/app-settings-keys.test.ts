import { describe, expect, it } from "vitest";
import {
	APP_SETTINGS_DEFAULTS,
	getDefaultCwd,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getResourceEnabled,
	getResourceRoot,
	getSelectedModel,
	getTheme,
	getThemeFamily,
	isDarkOnlyFamily,
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

	it("accepts all six current family ids", () => {
		expect(getThemeFamily({ themeFamily: "slate" })).toBe("slate");
		expect(getThemeFamily({ themeFamily: "linen" })).toBe("linen");
		expect(getThemeFamily({ themeFamily: "pebble" })).toBe("pebble");
		expect(getThemeFamily({ themeFamily: "sage" })).toBe("sage");
		expect(getThemeFamily({ themeFamily: "graphite" })).toBe("graphite");
		expect(getThemeFamily({ themeFamily: "nocturne" })).toBe("nocturne");
	});

	it("migrates retired families to their nearest replacement", () => {
		expect(getThemeFamily({ themeFamily: "sunrise" })).toBe("linen");
		expect(getThemeFamily({ themeFamily: "meadow" })).toBe("sage");
		expect(getThemeFamily({ themeFamily: "catppuccin" })).toBe("nocturne");
	});

	it("falls back to default for unknown values", () => {
		expect(getThemeFamily({ themeFamily: "unicorn" })).toBe("slate");
		expect(getThemeFamily({ themeFamily: 7 })).toBe("slate");
	});

	it("marks graphite and nocturne as dark-only", () => {
		expect(isDarkOnlyFamily("graphite")).toBe(true);
		expect(isDarkOnlyFamily("nocturne")).toBe(true);
		expect(isDarkOnlyFamily("slate")).toBe(false);
		expect(isDarkOnlyFamily("linen")).toBe(false);
		expect(isDarkOnlyFamily("pebble")).toBe(false);
		expect(isDarkOnlyFamily("sage")).toBe(false);
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
