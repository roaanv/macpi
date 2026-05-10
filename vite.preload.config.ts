import { defineConfig } from "vite";

// Forge's plugin-vite handles preload bundling natively when target === "preload".
// The output basename comes from the entry filename, so the source is named
// preload.ts (not index.ts) to produce preload.js — which src/main/index.ts
// references as `path.join(__dirname, "preload.js")`.
export default defineConfig({});
