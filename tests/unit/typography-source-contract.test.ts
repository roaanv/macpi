import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSources(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return rendererSources(path);
		return /\.(?:css|tsx?)$/.test(entry.name) ? [path] : [];
	});
}

const sourceFiles = rendererSources("src/renderer");
const joined = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

function source(path: string): string {
	return readFileSync(path, "utf8");
}

function openingTagContaining(contents: string, marker: string): string {
	const markerIndex = contents.indexOf(marker);
	expect(
		markerIndex,
		`missing source marker: ${marker}`,
	).toBeGreaterThanOrEqual(0);
	return contents.slice(
		contents.lastIndexOf("<", markerIndex),
		contents.indexOf(">", markerIndex) + 1,
	);
}

const arbitraryTextSizePattern =
	/text-\[((?:-?\d+(?:\.\d+)?|-?\.\d+))(px|rem|pt)\]/g;

function subMinimumTextSizes(source: string): string[] {
	return Array.from(source.matchAll(arbitraryTextSizePattern))
		.filter(([, value, unit]) => {
			const numericValue = Number(value);
			const pixels =
				unit === "rem"
					? numericValue * 16
					: unit === "pt"
						? numericValue * (4 / 3)
						: numericValue;
			return pixels < 11;
		})
		.map(([token]) => token);
}

describe("typography source guardrails", () => {
	it("does not use retired font variables", () => {
		for (const retired of [
			"--font-family",
			"--font-family-mono",
			"--font-body",
			"--font-size-sidebar",
		]) {
			expect(joined).not.toContain(retired);
		}
	});

	it("does not use sub-11px text utilities", () => {
		for (const file of sourceFiles) {
			expect(subMinimumTextSizes(readFileSync(file, "utf8")), file).toEqual([]);
		}
	});

	it("rejects decimal px, rem, and pt values below 11px", () => {
		for (const token of [
			"text-[9.5px]",
			"text-[10.0px]",
			"text-[0.625rem]",
			"text-[8pt]",
		]) {
			expect(subMinimumTextSizes(token), token).toHaveLength(1);
		}
	});

	it("allows text sizes at the 11px minimum", () => {
		expect(subMinimumTextSizes("text-[11px]")).toEqual([]);
	});

	it("defines all semantic roles", () => {
		for (const role of [
			"type-view-title",
			"type-section-heading",
			"type-body",
			"type-control",
			"type-label",
			"type-metadata",
			"type-overline",
			"type-status",
			"type-code",
		]) {
			expect(joined).toContain(role);
		}
	});

	it("gives the mounted help dialog a semantic body role", () => {
		const helpDialog = source("src/renderer/components/HelpDialog.tsx");
		const dialogTag = openingTagContaining(helpDialog, 'role="dialog"');
		expect(dialogTag).toContain("type-body");
		expect(dialogTag).not.toContain("text-sm");
	});

	it("does not use text-size utilities for the reviewed icon-only controls", () => {
		const chatPane = source("src/renderer/components/ChatPane.tsx");
		expect(
			openingTagContaining(chatPane, "aria-pressed={filesOpen}"),
		).not.toContain("text-xs");

		const modeRail = source("src/renderer/components/ModeRail.tsx");
		const gearGlyph = modeRail.slice(modeRail.indexOf("function GearGlyph()"));
		expect(openingTagContaining(gearGlyph, 'aria-hidden="true"')).not.toContain(
			"text-base",
		);

		const oauthDialog = source("src/renderer/components/OAuthLoginDialog.tsx");
		const oauthResult = oauthDialog.slice(
			oauthDialog.indexOf("{result ? ("),
			oauthDialog.indexOf("{!result"),
		);
		expect(oauthResult).not.toContain("text-xl");

		const providersSettings = source(
			"src/renderer/components/ProvidersSettings.tsx",
		);
		const addProviderControl = providersSettings.slice(
			providersSettings.indexOf("setAddingCustom(true)"),
			providersSettings.indexOf("Add custom OpenAI-compatible provider") +
				"Add custom OpenAI-compatible provider".length,
		);
		expect(addProviderControl).not.toContain("text-xl");

		const queuePills = source("src/renderer/components/banners/QueuePills.tsx");
		expect(
			openingTagContaining(queuePills, 'aria-label={`Remove "'),
		).not.toContain("text-[14px]");
	});
});
