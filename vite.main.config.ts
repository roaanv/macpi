import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * Copy SQL migration files from src/main/db/migrations into the main bundle's
 * output directory so the migration runner can read them at runtime.
 *
 * We can't use `vite-plugin-static-copy` here — it's ESM-only and Forge's
 * plugin-vite pre-loads vite.config.ts via CommonJS, which fails on ESM imports.
 */
function copyMigrationsPlugin(): Plugin {
	return {
		name: "macpi-copy-migrations",
		closeBundle() {
			const src = path.resolve(__dirname, "src/main/db/migrations");
			const dest = path.resolve(__dirname, ".vite/build/migrations");
			if (!fs.existsSync(src)) return;
			fs.mkdirSync(dest, { recursive: true });
			for (const f of fs.readdirSync(src)) {
				if (f.endsWith(".sql")) {
					fs.copyFileSync(path.join(src, f), path.join(dest, f));
				}
			}
		},
	};
}

export default defineConfig({
	plugins: [copyMigrationsPlugin()],
	build: {
		rollupOptions: {
			// Externalize @earendil-works packages so pi-coding-agent resolves
			// its own data files (templates, themes, wasm) from node_modules at
			// runtime instead of failing on bundled-but-relocated paths.
			external: ["electron", /^node:/, /^@earendil-works\//],
		},
	},
});
