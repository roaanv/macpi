// Redirects pi-coding-agent's npm global installs out of the system npm
// root (whatever `npm root -g` returns — typically asdf-managed) into
// macpi's own resource directory.
//
// Mechanism: setting `npm_config_prefix` as an env var overrides npm's
// default global prefix. Pi's DefaultPackageManager runs both `npm
// install -g <pkg>` and `npm root -g` to discover and use the global
// root, so both install AND lookup automatically point at our directory
// without any pi-specific patching.
//
// Result: extension npm packages land at <macpiRoot>/npm-global/lib/
// node_modules/<pkg>/ instead of polluting ~/.asdf/installs/.../lib/
// node_modules/. Git-based extensions already live under <macpiRoot>/
// git/ via pi's `agentDir` plumbing.

import path from "node:path";

const NPM_GLOBAL_SUBDIR = "npm-global";
const NPM_CONFIG_PREFIX_KEY = "npm_config_prefix";

/** Pure path derivation — kept separate so tests don't need env mutation. */
export function getNpmGlobalPrefix(macpiRoot: string): string {
	return path.join(macpiRoot, NPM_GLOBAL_SUBDIR);
}

/**
 * Sets `npm_config_prefix` in `process.env` to <macpiRoot>/npm-global so
 * pi's npm subprocesses install and resolve against macpi's directory.
 * Returns the path that was set.
 *
 * Call once at app boot, after the resource root is resolved. Changes
 * to `resourceRoot` at runtime require an app restart to take effect.
 */
export function configureNpmGlobalPrefix(macpiRoot: string): string {
	const prefix = getNpmGlobalPrefix(macpiRoot);
	process.env[NPM_CONFIG_PREFIX_KEY] = prefix;
	return prefix;
}
