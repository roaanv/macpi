import { describe, expect, it } from "vitest";
import {
	APP_SETTINGS_DEFAULTS,
	getDefaultCwd,
	getFontFamily,
	getFontFamilyMono,
	getFontSize,
	getResourceEnabled,
	getResourceRoot,
	getTheme,
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
