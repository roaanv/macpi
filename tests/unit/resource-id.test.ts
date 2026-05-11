import { describe, expect, it } from "vitest";
import {
	filterEnabled,
	parseResourceId,
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
