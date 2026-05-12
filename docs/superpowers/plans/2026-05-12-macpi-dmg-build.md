# macpi DMG Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a distributable `MacPi.dmg` from the existing electron-forge pipeline, with a polished install window (drag-to-Applications layout).

**Architecture:** Hook into electron-forge's existing `make` step (the same step that currently produces a ZIP on darwin). Add `@electron-forge/maker-dmg` to the `makers` array, scoped to darwin only. Configure window dimensions and contents so the user gets the conventional "drop here → Applications" UX. Add a `make dmg` shortcut so contributors don't need to remember the underlying `electron-forge make --platform=darwin` invocation. Signing/notarization is **explicitly out of scope** for this plan (see Follow-ups).

**Tech Stack:** `@electron-forge/maker-dmg` 7.11.x (wraps `electron-installer-dmg` → `appdmg`). Already-installed: `electron-forge` 7.11.x, `@electron-forge/plugin-vite`, `@electron-forge/plugin-fuses`.

---

## File Structure

| Change | File | Responsibility |
|---|---|---|
| Modify | `package.json` | Add `@electron-forge/maker-dmg` to devDependencies (pin to 7.11.x to match other forge packages). |
| Modify | `forge.config.ts` | Import `MakerDMG`, append to `makers` with `["darwin"]` platform restriction, configure window + contents. |
| Modify | `Makefile` | New `dmg` PHONY target that runs `npm run make -- --platform=darwin` and reports the produced path. |
| Modify | `.gitignore` | (verify) `out/` is already ignored — DMG artifacts land there. No new entry needed if already covered. |

Intentionally **not** creating:
- A DMG background image. The default DMG window without a background still looks clean. A custom background is a polish task that can come later once the icon set is finalised.
- A separate `scripts/make-dmg.sh` — the Makefile target is sufficient indirection.

---

## Task 1: Add `@electron-forge/maker-dmg` dependency

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `package-lock.json` (generated)

- [ ] **Step 1: Install the package pinned to the existing forge version**

Run: `npm install --save-dev @electron-forge/maker-dmg@^7.11.1`

The version range must match the other `@electron-forge/*` packages (currently `^7.11.1`). Mismatched forge versions cause obscure runtime errors during `make`.

- [ ] **Step 2: Verify it landed in devDependencies**

Run: `node -e "console.log(require('./package.json').devDependencies['@electron-forge/maker-dmg'])"`
Expected: prints `^7.11.1` (or similar 7.11.x).

- [ ] **Step 3: Verify the package resolves**

Run: `node -e "require.resolve('@electron-forge/maker-dmg')"`
Expected: prints an absolute path under `node_modules/`. Throws if the install was incomplete.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @electron-forge/maker-dmg dependency"
```

---

## Task 2: Wire `MakerDMG` into `forge.config.ts`

**Files:**
- Modify: `forge.config.ts` — add import + append maker to the `makers` array

- [ ] **Step 1: Add the import**

In `forge.config.ts`, alongside the other `@electron-forge/maker-*` imports (at top of file):

```ts
import { MakerDMG } from "@electron-forge/maker-dmg";
```

- [ ] **Step 2: Append the maker to the `makers` array**

Replace the existing `makers: [...]` array with one that includes a darwin-scoped `MakerDMG`. Keep `MakerZIP` for darwin too (CI artifact, useful for auto-update later):

```ts
makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(
        {
            name: "MacPi",
            icon: "build/icon.icns",
            // Default volume label looks like "MacPi 0.1.0".
            // window/contents are populated in Task 3.
        },
        ["darwin"],
    ),
    new MakerRpm({}),
    new MakerDeb({}),
],
```

- [ ] **Step 3: Verify the config still type-checks**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Verify forge can enumerate makers**

Run: `npx electron-forge make --help`
Expected: command prints help text without errors. (If the maker is misconfigured, forge errors out during config load.)

- [ ] **Step 5: Commit**

```bash
git add forge.config.ts
git commit -m "build(dmg): wire MakerDMG into forge config"
```

---

## Task 3: Configure DMG window layout

**Files:**
- Modify: `forge.config.ts` — extend the `MakerDMG` config from Task 2 with `additionalDMGOptions` + `contents`

**Why this step exists separately:** Task 2 produced a working but plain DMG (single icon, no Applications symlink). This task adds the conventional install UX — the user sees the MacPi icon on the left and an Applications-folder symlink on the right, with a hint to drag between them.

- [ ] **Step 1: Extend the `MakerDMG` config**

Replace the `new MakerDMG({...}, ["darwin"])` block with:

```ts
new MakerDMG(
    {
        name: "MacPi",
        icon: "build/icon.icns",
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
                path: (opts as { appPath: string }).appPath,
            },
            { x: 400, y: 200, type: "link", path: "/Applications" },
        ],
    },
    ["darwin"],
),
```

Notes for the implementer:
- `contents` is a function (not a literal array) so it receives the runtime `opts.appPath` pointing at the built `MacPi.app`. Hard-coding the path doesn't work — appdmg needs the resolved location forge passes in.
- Coordinates are in points relative to the DMG window's top-left. The values above produce icons roughly centered vertically with comfortable margins; they're not magic.
- The cast `(opts as { appPath: string })` is needed because forge's type for the callback doesn't expose `appPath` — the underlying `electron-installer-dmg` always sets it.

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add forge.config.ts
git commit -m "build(dmg): drag-to-Applications window layout"
```

---

## Task 4: Add `make dmg` Make target

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Append `dmg` to the PHONY declaration**

Find the line beginning `.PHONY:` and add `dmg`:

```make
.PHONY: setup build run test test-all lint format typecheck clean deploy dmg
```

- [ ] **Step 2: Add the `dmg` target at the end of the file**

```make
# Build a distributable .dmg via electron-forge make. Output lands under
# out/make/. Unsigned — Gatekeeper will warn on first launch until we add
# signing+notarization (see the DMG plan's Follow-ups section).
dmg:
	npm run make -- --platform=darwin
	@DMG_PATH=$$(find out/make -maxdepth 4 -name "*.dmg" -type f 2>/dev/null | head -1); \
	if [ -z "$$DMG_PATH" ]; then \
		echo "dmg: build finished but no .dmg found under out/make/" >&2; \
		exit 1; \
	fi; \
	echo "DMG produced: $$DMG_PATH"
```

- [ ] **Step 3: Verify `make` recognises the new target**

Run: `make -n dmg`
Expected: prints the `npm run make -- --platform=darwin` line (and the locate-and-print shell block) without executing.

- [ ] **Step 4: Commit**

```bash
git add Makefile
git commit -m "build(dmg): add 'make dmg' target"
```

---

## Task 5: Smoke-test the DMG end-to-end (manual)

This task is **user-driven** — it requires interacting with Finder, double-clicking the DMG, and confirming visual layout. The implementer reports back from each step.

- [ ] **Step 1: Produce the DMG**

Run: `make dmg`

Expected:
- Build runs to completion (may take 30–90s).
- Final line prints `DMG produced: out/make/.../MacPi-<version>-arm64.dmg` (or x64 — depends on machine arch).
- Exit code 0.

If the build fails:
- Re-run with `--verbose`: `npx electron-forge make --platform=darwin --verbose`
- Look for errors from `appdmg` (window/contents misconfig) or from `electron-packager` (signing/codesign warnings — expected, ignore for now).

- [ ] **Step 2: Open the DMG in Finder**

Run: `open "$(find out/make -name '*.dmg' | head -1)"`

Expected:
- A Finder window appears showing the MacPi icon on the left and an Applications folder symlink on the right.
- Window dimensions are roughly 540×380.
- Both icons are at the same vertical position.

- [ ] **Step 3: Drag-install and verify the app launches**

In the open DMG window:
- Drag the MacPi icon onto the Applications symlink.
- Eject the DMG (⌘E or Finder eject button).
- Open `/Applications/MacPi.app`.

Expected:
- macOS Gatekeeper shows a warning ("unidentified developer"). This is **expected** in DMG-only mode (no signing yet). Click "Open" via right-click → Open to bypass.
- App launches normally — same UI as `make run`.

- [ ] **Step 4: Confirm or report regressions**

If the DMG opens with the wrong layout, no Applications symlink, or the app doesn't launch from `/Applications`:
- Capture the issue (screenshot or text).
- Iterate by adjusting `contents`/`window` in `forge.config.ts` (Task 3) and re-running `make dmg`.

---

## Follow-ups (intentionally out of scope)

These are sized as future plans, not part of this one:

1. **Code signing with Developer ID Application certificate.** The user already has the cert in their keychain. Wiring is small: add `packagerConfig.osxSign` with the identity name, set `CSC_NAME` env var, and remove `OnlyLoadAppFromAsar` if it conflicts (it shouldn't). Roughly one task, one commit.

2. **Notarization with `notarytool`.** Requires Apple ID + app-specific password (stored in keychain) OR an App Store Connect API key. Add `packagerConfig.osxNotarize`. Adds 5–15 minutes to each `make dmg` run because Apple's notary service is slow.

3. **Universal binary (x64 + arm64).** Use `@electron/universal` so one DMG runs on both Intel and Apple Silicon. Doubles build time and disk usage; only worth it once we ship outside our own machines.

4. **Auto-update.** `update-electron-app` (zero-config, points at GitHub Releases) is the cheapest option. Requires the app to be signed first (Squirrel.Mac refuses to update unsigned builds). Plan this only after signing lands.

5. **Custom DMG background image.** Polish-tier: design a 540×380 background with subtle "drag here →" hint. Reference via `additionalDMGOptions.background` in the MakerDMG config.

---

## Self-Review

- ✅ Every task has exact commands and expected output.
- ✅ Code blocks are complete (no "TBD" / "TODO" / "similar to above" placeholders).
- ✅ Type/name consistency: `MakerDMG` used throughout, `appPath` field consistent, Makefile target name `dmg` matches PHONY entry.
- ✅ Spec coverage: the user's request was "DMG build" with cert already in keychain. Plan delivers a working DMG; flags signing as a clearly-bounded follow-up. No drift into broader distribution work.
- ✅ Granularity: each task is one logical change with a verification step. Task 5 is intentionally manual (visual DMG inspection can't be automated cheaply).
