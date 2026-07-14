import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(component: string) {
	return fs.readFileSync(
		path.join(process.cwd(), "src/renderer/components", `${component}.tsx`),
		"utf8",
	);
}

describe("settings typography follow-up contracts", () => {
	it("fully migrates DefaultsSettings labels, path input, and action", () => {
		const value = source("DefaultsSettings");
		expect(value).not.toContain("text-sm font-medium");
		expect(value).toMatch(/Default cwd<\/div>/);
		expect(value).toContain(
			"type-code type-control type-ellipsis type-technical-wrap",
		);
		expect(value).toContain("type-control text-accent hover:underline");
		expect(value.match(/type-label/g)?.length).toBeGreaterThanOrEqual(3);
	});

	it("uses labels for visible create-dialog field captions", () => {
		for (const component of ["CreateWorkspaceDialog", "CreateSessionDialog"]) {
			const value = source(component);
			expect(value).not.toMatch(/type-metadata text-muted">(?:Name|cwd)/);
			expect(value).toMatch(/type-label text-muted">(?:Name|cwd)/);
		}
	});
});
