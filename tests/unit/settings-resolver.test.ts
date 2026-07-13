import { describe, expect, it } from "vitest";
import {
	resolveSettings,
	type SettingsLayers,
} from "../../src/main/settings/resolver";
import { DEFAULT_SETTINGS } from "../../src/shared/settings-keys";

describe("settings resolver", () => {
	it("returns defaults when no overrides present", () => {
		const layers: SettingsLayers = { global: {}, workspace: {}, session: {} };
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe(DEFAULT_SETTINGS.thinkingLevel);
		expect(r.provenance.thinkingLevel).toBe("default");
	});

	it("session overrides workspace overrides global", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			workspace: { thinkingLevel: "medium" },
			session: { thinkingLevel: "high" },
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("high");
		expect(r.provenance.thinkingLevel).toBe("session");
	});

	it("workspace wins when no session override", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			workspace: { thinkingLevel: "medium" },
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("medium");
		expect(r.provenance.thinkingLevel).toBe("workspace");
	});

	it("falls back through unset layers", () => {
		const layers: SettingsLayers = {
			global: { thinkingLevel: "low" },
			workspace: {},
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.thinkingLevel).toBe("low");
		expect(r.provenance.thinkingLevel).toBe("global");
	});

	it("array values are replaced wholesale (not merged)", () => {
		const layers: SettingsLayers = {
			global: { enabledSkills: ["a", "b"] },
			workspace: { enabledSkills: ["c"] },
			session: {},
		};
		const r = resolveSettings(layers);
		expect(r.values.enabledSkills).toEqual(["c"]);
		expect(r.provenance.enabledSkills).toBe("workspace");
	});

	it("missing key from defaults stays absent", () => {
		const layers: SettingsLayers = { global: {}, workspace: {}, session: {} };
		const r = resolveSettings(layers);
		expect(r.values.systemPrompt).toBeNull();
		expect(r.provenance.systemPrompt).toBe("default");
	});
});
