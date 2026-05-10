import { describe, expect, it } from "vitest";
import {
	resolveSettings,
	type SettingsLayers,
} from "../../src/main/settings/resolver";
import { DEFAULT_SETTINGS } from "../../src/shared/settings-keys";

describe("settings resolver", () => {
	it("returns defaults when no overrides present", () => {
		const layers: SettingsLayers = { global: {}, channel: {}, session: {} };
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe(DEFAULT_SETTINGS.thinkingLevel);
		expect(r.provenance.thinkingLevel).toBe("default");
	});

	it("session overrides channel overrides global", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			channel: { thinkingLevel: "medium" },
			session: { thinkingLevel: "high" },
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("high");
		expect(r.provenance.thinkingLevel).toBe("session");
	});

	it("channel wins when no session override", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			channel: { thinkingLevel: "medium" },
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("medium");
		expect(r.provenance.thinkingLevel).toBe("channel");
	});

	it("falls back through unset layers", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			channel: {},
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("low");
		expect(r.provenance.thinkingLevel).toBe("global");
	});

	it("array values are replaced wholesale (not merged)", () => {
		const layers: SettingsLayers = {
			global: { enabledSkills: ["a", "b"] },
			channel: { enabledSkills: ["c"] },
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.enabledSkills).toEqual(["c"]);
		expect(r.provenance.enabledSkills).toBe("channel");
	});

	it("missing key from defaults stays absent", () => {
		const layers: SettingsLayers = { global: {}, channel: {}, session: {} };
		const r = resolveSettings(layers);
		expect(r.values.systemPrompt).toBeNull();
		expect(r.provenance.systemPrompt).toBe("default");
	});
});
