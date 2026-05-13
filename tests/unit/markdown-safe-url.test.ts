import { describe, expect, it } from "vitest";
import { __safeUrlForTesting as safeUrl } from "../../src/renderer/components/messages/MarkdownText";

describe("safeUrl (markdown url-scheme allowlist)", () => {
	it("passes through http/https/mailto URLs", () => {
		expect(safeUrl("https://example.com")).toBe("https://example.com");
		expect(safeUrl("http://example.com")).toBe("http://example.com");
		expect(safeUrl("mailto:foo@bar.com")).toBe("mailto:foo@bar.com");
	});

	it("strips javascript: URLs", () => {
		expect(safeUrl("javascript:alert(1)")).toBe("");
		// Mixed case — protocol parsing normalises to lowercase.
		expect(safeUrl("JaVaScRiPt:alert(1)")).toBe("");
	});

	it("strips file: and data: URLs", () => {
		expect(safeUrl("file:///etc/passwd")).toBe("");
		expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
	});

	it("passes through relative URLs unchanged", () => {
		// Relative URLs have no scheme to abuse; URL ctor throws and we
		// fall through, letting react-markdown render them as-is.
		expect(safeUrl("/some/path")).toBe("/some/path");
		expect(safeUrl("relative.html")).toBe("relative.html");
		expect(safeUrl("#anchor")).toBe("#anchor");
	});
});
