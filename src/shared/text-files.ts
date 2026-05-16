// Pure classification helpers shared between main (FilesService) and
// renderer (FileTree, FilePreview). No node-only or browser-only APIs —
// just string predicates over basenames.

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
	".txt",
	".md",
	".markdown",
	".json",
	".jsonc",
	".yaml",
	".yml",
	".toml",
	".csv",
	".tsv",
	".log",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".rs",
	".go",
	".rb",
	".java",
	".kt",
	".swift",
	".c",
	".cpp",
	".h",
	".hpp",
	".sh",
	".bash",
	".zsh",
	".sql",
	".css",
	".scss",
	".html",
	".htm",
	".xml",
	".gitignore",
	".env",
	".editorconfig",
]);

export const TEXT_FILENAMES: ReadonlySet<string> = new Set([
	"Dockerfile",
	"Makefile",
	"LICENSE",
	"README",
	"CHANGELOG",
	"NOTICE",
]);

export const IGNORED_NAMES: ReadonlySet<string> = new Set([
	"node_modules",
	".git",
	".DS_Store",
	".next",
	"dist",
	"build",
	"out",
	".vite",
	".turbo",
	".cache",
	".nuxt",
	".svelte-kit",
	".parcel-cache",
	".pytest_cache",
	"__pycache__",
]);

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

function lastExt(name: string): string {
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return ""; // ".env" has dot at 0 — handled separately below
	return name.slice(dot).toLowerCase();
}

export function isTextPath(name: string): boolean {
	if (TEXT_FILENAMES.has(name)) return true;
	const ext = lastExt(name);
	if (ext && TEXT_EXTENSIONS.has(ext)) return true;
	// Dotfile-as-whole-name (e.g. ".env", ".gitignore"): the leading dot
	// IS the extension in our table.
	if (name.startsWith(".")) {
		const asExt = name.toLowerCase();
		if (TEXT_EXTENSIONS.has(asExt)) return true;
		// Compound dotfiles like ".env.local" — strip the suffix and re-check.
		const firstDot = name.indexOf(".", 1);
		if (firstDot > 0) {
			const prefix = name.slice(0, firstDot).toLowerCase();
			if (TEXT_EXTENSIONS.has(prefix)) return true;
		}
	}
	return false;
}

export function isMarkdownPath(name: string): boolean {
	const ext = lastExt(name);
	return MARKDOWN_EXTENSIONS.has(ext);
}

export function shouldHide(name: string, showHidden: boolean): boolean {
	if (showHidden) return false;
	if (name.startsWith(".")) return true;
	if (IGNORED_NAMES.has(name)) return true;
	return false;
}
