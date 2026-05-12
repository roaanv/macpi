// Renderer-safe helper for turning pi's verbose source strings (npm:/git:/
// absolute paths) into something short enough for list rows. Lives in
// shared/ so both the main process (importer) and the renderer (list rows)
// can use it without duplicating the heuristics.

/**
 * Strip a pi package source prefix to produce a human-friendly label.
 *   "npm:pi-mcp-adapter"               -> "pi-mcp-adapter"
 *   "npm:@scope/pkg"                   -> "@scope/pkg"
 *   "git:https://github.com/foo/bar"   -> "foo/bar"
 *   "git:github.com/foo/bar"           -> "foo/bar"
 *   "local:/Users/me/code/foo"         -> "foo"
 *   "/abs/path/to/extension"           -> "extension"
 *   "../relative/path/to/extension"    -> "extension"
 *   anything else                      -> source itself
 *
 * Pi normalises local packages to "local:<absolute path>" (see
 * pi-coding-agent's package-manager.resolvePath), which is why "local:"
 * gets its own branch even though absolute paths already work.
 */
export function friendlyNameForSource(source: string): string {
	if (source.startsWith("npm:")) return source.slice(4);
	if (source.startsWith("git:")) {
		const rest = source.slice(4).replace(/^https?:\/\//, "");
		const parts = rest.split("/").filter(Boolean);
		return parts.slice(-2).join("/") || rest;
	}
	if (source.startsWith("local:")) {
		const rest = source.slice(6);
		const parts = rest.split(/[/\\]/).filter(Boolean);
		return parts[parts.length - 1] ?? rest;
	}
	if (
		source.startsWith("/") ||
		source.startsWith("./") ||
		source.startsWith("../") ||
		source.startsWith("~")
	) {
		const parts = source.split(/[/\\]/).filter(Boolean);
		return parts[parts.length - 1] ?? source;
	}
	return source;
}
