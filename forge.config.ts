import fs from "node:fs";
import path from "node:path";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

// Code signing + notarization are opt-in via environment variables so local
// `make build` / `make dmg` runs stay fast and unsigned. The release workflow
// (.github/workflows/release.yml) exports these before invoking `npm run make`.
// When APPLE_SIGNING_IDENTITY is absent, osxSign/osxNotarize are undefined and
// electron-packager skips both steps entirely.
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY;
const notarizeApiKey = process.env.APPLE_API_KEY_PATH;
const notarizeApiKeyId = process.env.APPSTORE_API_KEY_ID;
const notarizeApiIssuer = process.env.APPSTORE_API_ISSUER_ID;

const osxSign = signingIdentity
	? {
			identity: signingIdentity,
			// Hardened Runtime is required for notarization; the entitlements
			// relax it for Electron's JIT and pi-coding-agent's unpacked native
			// modules (see build/entitlements.plist).
			optionsForFile: () => ({
				entitlements: "build/entitlements.plist",
				hardenedRuntime: true,
			}),
		}
	: undefined;

const osxNotarize =
	notarizeApiKey && notarizeApiKeyId && notarizeApiIssuer
		? {
				appleApiKey: notarizeApiKey,
				appleApiKeyId: notarizeApiKeyId,
				appleApiIssuer: notarizeApiIssuer,
			}
		: undefined;

const config: ForgeConfig = {
	packagerConfig: {
		name: "MacPi",
		appBundleId: "io.0112.macpi",
		appCategoryType: "public.app-category.developer-tools",
		// Keep @earendil-works packages and the wasm-backed photon-node on
		// disk (app.asar.unpacked) so pi-coding-agent can resolve its own
		// data files (templates, themes, wasm) via real filesystem paths
		// and spawn helper subprocesses. The rest of the app lives inside
		// app.asar. The leading `**/` is required — @electron/asar's
		// minimatch globs match against the entry's full asar-relative path.
		asar: {
			unpack: "**/{@earendil-works,@silvia-odwyer/photon-node}/**/*",
		},
		// Extensionless path — electron-packager picks build/icon.icns on
		// darwin, build/icon.ico on win32, build/icon.png on linux.
		// Regenerate platform artifacts via ./scripts/build-icons.sh after
		// replacing build/icon.png.
		icon: "build/icon",
		// Both undefined for local dev builds (signing env vars absent), which
		// leaves electron-packager's sign + notarize steps disabled.
		osxSign,
		osxNotarize,
	},
	hooks: {
		// forge's plugin-vite nukes the entire node_modules tree in its
		// packageAfterCopy hook on the assumption that everything is bundled
		// into the main vite output. We deliberately externalize
		// @earendil-works/* in vite.main.config.ts so pi-coding-agent
		// resolves its own data files at runtime — which means those
		// packages must physically exist in the packaged app. This runs
		// after the plugin strips, restoring node_modules from the project
		// root so the asar step includes everything.
		packageAfterPrune: async (_config, buildPath) => {
			const src = path.resolve(__dirname, "node_modules");
			const dst = path.resolve(buildPath, "node_modules");
			await fs.promises.cp(src, dst, {
				recursive: true,
				dereference: true,
				errorOnExist: false,
				force: true,
			});
		},
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel({}),
		new MakerZIP({}, ["darwin"]),
		new MakerDMG(
			{
				name: "MacPi",
				icon: "build/icon.icns",
				// Default volume label looks like "MacPi 0.1.0".
				// Set the DMG window dimensions and icon positions so users get
				// the conventional "drop the app onto Applications" UX.
				additionalDMGOptions: {
					window: {
						size: { width: 540, height: 380 },
					},
				},
				contents: (opts) => [
					{
						x: 140,
						y: 200,
						type: "file",
						// forge's MakerDMGConfig Omits `appPath` from the callback
						// signature even though electron-installer-dmg passes it at
						// runtime; the cast is the documented workaround.
						path: (opts as { appPath: string }).appPath,
					},
					{ x: 400, y: 200, type: "link", path: "/Applications" },
				],
			},
			["darwin"],
		),
		new MakerRpm({}),
		new MakerDeb({}),
	],
	plugins: [
		new VitePlugin({
			// `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
			// If you are familiar with Vite configuration, it will look really familiar.
			build: [
				{
					entry: "src/main/index.ts",
					config: "vite.main.config.ts",
					target: "main",
				},
				{
					entry: "src/preload/preload.ts",
					config: "vite.preload.config.ts",
					target: "preload",
				},
			],
			renderer: [
				{
					name: "main_window",
					config: "vite.renderer.config.ts",
				},
			],
		}),
		// Fuses are used to enable/disable various Electron functionality
		// at package time, before code signing the application
		new FusesPlugin({
			version: FuseVersion.V1,
			[FuseV1Options.RunAsNode]: false,
			[FuseV1Options.EnableCookieEncryption]: true,
			[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
			[FuseV1Options.EnableNodeCliInspectArguments]: false,
			[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
			[FuseV1Options.OnlyLoadAppFromAsar]: true,
		}),
	],
};

export default config;
