import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = (name: string) =>
	readFileSync(`src/renderer/components/${name}.tsx`, "utf8");

const roleContracts: Record<string, readonly string[]> = {
	NotesList: ["type-overline", "type-label", "type-metadata"],
	PromptsList: ["type-overline", "type-label", "type-metadata"],
	SkillsList: ["type-overline", "type-label", "type-metadata"],
	ExtensionsList: ["type-overline", "type-label", "type-metadata"],
	PromptDetail: ["type-section-heading", "type-label", "type-control"],
	SkillDetail: ["type-section-heading", "type-control"],
	ExtensionDetail: ["type-section-heading", "type-control"],
	DiagnosticsPanel: ["type-section-heading", "type-code", "type-status"],
};

describe("navigation typography source contract", () => {
	it.each(
		Object.entries(roleContracts),
	)("maps %s to its semantic roles", (component, roles) => {
		const source = componentSource(component);
		for (const role of roles) {
			expect(source).toContain(role);
		}
	});

	it("removes local 9px/10px typography overrides", () => {
		for (const component of Object.keys(roleContracts)) {
			const source = componentSource(component);
			expect(source).not.toMatch(/text-\[(?:9|10)px\]/);
		}
	});
});
