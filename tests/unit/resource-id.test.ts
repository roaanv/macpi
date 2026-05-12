import { describe, expect, it } from "vitest";
import {
	extensionResourceId,
	filterEnabled,
	parseResourceId,
	promptResourceId,
	skillResourceId,
} from "../../src/shared/resource-id";

describe("resource-id", () => {
	it("formats skill ids", () => {
		expect(skillResourceId({ source: "local", relativePath: "foo.md" })).toBe(
			"skill:local:foo.md",
		);
		expect(
			skillResourceId({
				source: "git@github.com:x/y.git",
				relativePath: "sub/bar.md",
			}),
		).toBe("skill:git@github.com:x/y.git:sub/bar.md");
	});

	it("parses skill ids back", () => {
		expect(parseResourceId("skill:local:foo.md")).toEqual({
			type: "skill",
			source: "local",
			relativePath: "foo.md",
		});
		// Source containing colons is preserved (we only split on the last colon).
		expect(parseResourceId("skill:git@github.com:x/y.git:sub/bar.md")).toEqual({
			type: "skill",
			source: "git@github.com:x/y.git",
			relativePath: "sub/bar.md",
		});
	});

	it("returns null for malformed ids", () => {
		expect(parseResourceId("not-an-id")).toBeNull();
		expect(parseResourceId("skill:only")).toBeNull();
	});
});

describe("extensionResourceId", () => {
	it("formats extension ids", () => {
		expect(
			extensionResourceId({ source: "local", relativePath: "my-ext.ts" }),
		).toBe("extension:local:my-ext.ts");
		expect(
			extensionResourceId({
				source: "git@github.com:x/y.git",
				relativePath: "lib/index.ts",
			}),
		).toBe("extension:git@github.com:x/y.git:lib/index.ts");
	});

	it("parses extension ids back", () => {
		expect(parseResourceId("extension:local:my-ext.ts")).toEqual({
			type: "extension",
			source: "local",
			relativePath: "my-ext.ts",
		});
	});
});

describe("promptResourceId", () => {
	it("formats prompt ids and round-trips through parseResourceId", () => {
		expect(
			promptResourceId({ source: "local", relativePath: "recap.md" }),
		).toBe("prompt:local:recap.md");
		expect(parseResourceId("prompt:local:recap.md")).toEqual({
			type: "prompt",
			source: "local",
			relativePath: "recap.md",
		});
	});
});

describe("filterEnabled", () => {
	const items = [
		{ id: "skill:local:a.md", name: "a" },
		{ id: "skill:local:b.md", name: "b" },
		{ id: "skill:local:c.md", name: "c" },
	];

	it("missing entries treated as enabled", () => {
		expect(filterEnabled(items, {})).toEqual(items);
	});

	it("explicit false filters out", () => {
		expect(filterEnabled(items, { "skill:local:b.md": false })).toEqual([
			items[0],
			items[2],
		]);
	});

	it("explicit true keeps in", () => {
		expect(
			filterEnabled(items, {
				"skill:local:a.md": true,
				"skill:local:b.md": false,
			}),
		).toEqual([items[0], items[2]]);
	});
});
