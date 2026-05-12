import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	configureNpmGlobalPrefix,
	getNpmGlobalPrefix,
} from "../../src/main/npm-global-prefix";

describe("getNpmGlobalPrefix", () => {
	it("appends /npm-global to the macpi root", () => {
		expect(getNpmGlobalPrefix("/some/path/.macpi")).toBe(
			path.join("/some/path/.macpi", "npm-global"),
		);
	});

	it("works with trailing-slash inputs", () => {
		expect(getNpmGlobalPrefix("/some/path/.macpi/")).toBe(
			path.join("/some/path/.macpi", "npm-global"),
		);
	});
});

describe("configureNpmGlobalPrefix", () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.npm_config_prefix;
		delete process.env.npm_config_prefix;
	});

	afterEach(() => {
		if (originalPrefix === undefined) {
			delete process.env.npm_config_prefix;
		} else {
			process.env.npm_config_prefix = originalPrefix;
		}
	});

	it("sets process.env.npm_config_prefix to <macpiRoot>/npm-global", () => {
		const result = configureNpmGlobalPrefix("/tmp/test-macpi");
		const expected = path.join("/tmp/test-macpi", "npm-global");
		expect(result).toBe(expected);
		expect(process.env.npm_config_prefix).toBe(expected);
	});

	it("overwrites any pre-existing value", () => {
		process.env.npm_config_prefix = "/preexisting/prefix";
		configureNpmGlobalPrefix("/tmp/test-macpi");
		expect(process.env.npm_config_prefix).toBe(
			path.join("/tmp/test-macpi", "npm-global"),
		);
	});
});
