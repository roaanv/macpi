import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `root: "src/renderer"` lets Vite resolve `src/renderer/index.html` as
// the entry. But Vite resolves `build.outDir` relative to `root`, so
// forge's injected relative outDir lands at
// `src/renderer/.vite/renderer/main_window/` — invisible to the
// packager (it only includes the project-root `.vite/` in app.asar).
// Pin outDir to an absolute project-root path so output lands where
// forge expects regardless of `root`.
export default defineConfig({
	root: "src/renderer",
	plugins: [react()],
	build: {
		outDir: path.resolve(__dirname, ".vite/renderer/main_window"),
		emptyOutDir: true,
	},
});
