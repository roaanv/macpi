/* biome-ignore-all lint/suspicious/noTemplateCurlyInString: tests intentionally contain pi-style ${@:N} template grammar inside ordinary strings */
import { describe, expect, it } from "vitest";
import { expand } from "../../src/renderer/slash/expand";

describe("expand", () => {
	it("substitutes $1, $2 positional args (1-indexed)", () => {
		expect(expand("hi $1, $2", ["alice", "bob"])).toBe("hi alice, bob");
	});

	it("renders missing positional args as empty string", () => {
		expect(expand("hi $1 $2 $3", ["alice"])).toBe("hi alice  ");
	});

	it("substitutes $@ and $ARGUMENTS with all args space-joined", () => {
		expect(expand("run: $@", ["a", "b", "c"])).toBe("run: a b c");
		expect(expand("run: $ARGUMENTS", ["a", "b"])).toBe("run: a b");
	});

	it("substitutes ${@:N} for args from position N", () => {
		expect(expand("$0 ${@:2}", ["a", "b", "c", "d"])).toBe("$0 b c d");
	});

	it("substitutes ${@:N:L} for L args from position N", () => {
		expect(expand("${@:2:2}", ["a", "b", "c", "d"])).toBe("b c");
	});

	it("leaves unknown $identifier untouched", () => {
		expect(expand("price: $foo", [])).toBe("price: $foo");
	});

	it("returns empty string for ${@:N} when N is past end", () => {
		expect(expand("[${@:5}]", ["a", "b"])).toBe("[]");
	});
});
