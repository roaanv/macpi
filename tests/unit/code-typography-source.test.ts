import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const technicalSources = [
	"src/renderer/components/messages/MarkdownText.tsx",
	"src/renderer/components/messages/ToolBlock.tsx",
	"src/renderer/components/CodeEditor.tsx",
	"src/renderer/components/FilePreview.tsx",
	"src/renderer/components/ModelsJsonEditor.tsx",
] as const;

describe("code typography source contract", () => {
	it.each(technicalSources)("maps %s to the semantic code role", (path) => {
		const component = source(path);
		expect(component).toContain("type-code");
		expect(component).not.toContain("--font-family-mono");
		expect(component).not.toMatch(
			/className\s*=\s*(?:"[^"]*\bfont-mono\b[^"]*"|\{`[^`]*\bfont-mono\b[^`]*`\})/s,
		);
	});

	it("reconfigures CodeMirror typography when the document theme changes", () => {
		const editor = source("src/renderer/components/CodeEditor.tsx");
		expect(editor).toMatch(
			/import\s*\{[^}]*\bCompartment\b[^}]*\}\s*from\s*"@codemirror\/state"/s,
		);
		expect(editor).toContain("codeEditorTheme");
		expect(editor).toContain("var(--font-mono)");
		expect(editor).toContain("var(--font-size-code-block)");
		expect(editor).toContain('lineHeight: "1.5385"');
		expect(editor).toContain("new Compartment");
		expect(editor).toContain("new MutationObserver");
		expect(editor).toContain('classList.contains("dark")');
		expect(editor).toContain("themeCompartment.reconfigure");
		expect(editor).toContain("observer.disconnect");
		expect(editor).not.toMatch(/\{\s*dark:\s*true\s*\}/);
	});

	it("uses semantic roles for note conflict and models controls", () => {
		const noteEditor = source("src/renderer/components/NoteEditor.tsx");
		expect(noteEditor).toMatch(/surface-warn-soft[^"\n]*type-status/);
		expect(noteEditor).not.toMatch(/surface-warn-soft[^"\n]*text-sm/);

		const modelsEditor = source("src/renderer/components/ModelsJsonEditor.tsx");
		expect(modelsEditor).toContain("type-control");
		expect(modelsEditor).toContain(
			'<span className="type-label">Custom models</span>',
		);
		expect(modelsEditor).not.toMatch(/\b(?:text-sm|font-medium)\b/);
	});

	it("defines placeholder color and titles for truncated chat values", () => {
		const css = source("src/renderer/styles.css");
		expect(css).toMatch(
			/\.placeholder-faint::placeholder\s*\{[^}]*color:\s*var\(--text-faint\)/s,
		);

		const slashPopup = source("src/renderer/components/SlashPopup.tsx");
		expect(slashPopup).toContain("title={cmd.description}");

		const contextBar = source("src/renderer/components/ChatContextBar.tsx");
		expect(contextBar).toContain("title={d.sessionLabel}");
	});
});
