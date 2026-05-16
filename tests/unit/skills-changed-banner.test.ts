import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SkillsChangedBanner } from "../../src/renderer/components/banners/SkillsChangedBanner";

describe("SkillsChangedBanner", () => {
	it("explains that tools and resources require a session reload", () => {
		const html = renderToStaticMarkup(
			React.createElement(SkillsChangedBanner, {
				changed: true,
				reloading: false,
				onReload: vi.fn(),
			}),
		);

		expect(html).toContain("Tools/resources changed");
		expect(html).toContain("reload the session to apply");
	});
});
