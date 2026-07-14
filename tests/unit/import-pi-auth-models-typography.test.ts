import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(process.cwd(), "src/renderer/components/ImportPiAuthModels.tsx"),
	"utf8",
);

describe("ImportPiAuthModels typography contract", () => {
	it("uses semantic roles for its title, labels, control, statuses, and technical paths", () => {
		expect(source).toContain("type-section-heading");
		expect(source).toContain("type-label");
		expect(source).toContain("type-control");
		expect(source).toContain("type-status");
		expect(source.match(/type-code type-technical-wrap/g)).toHaveLength(4);
	});
});
