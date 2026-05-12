#!/usr/bin/env bash
# Patch the dev-mode Electron binary's Info.plist so the macOS menu bar and
# app switcher show "MacPi" instead of "Electron" during `npm start`.
#
# macOS reads CFBundleName/CFBundleDisplayName from the running bundle's
# Info.plist BEFORE the JS executes, so app.setName() at runtime cannot fix
# this in dev. Packaged builds get the right name automatically via
# forge.config.ts (packagerConfig.name) — this script is dev-only.
#
# Runs as a postinstall step so the patch survives reinstalls of the
# electron package. Silent no-op on non-macOS hosts.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
    exit 0
fi

PLIST="node_modules/electron/dist/Electron.app/Contents/Info.plist"
if [[ ! -f "$PLIST" ]]; then
    # Electron not installed yet (or layout changed); not our problem.
    exit 0
fi

NAME="MacPi"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $NAME" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $NAME" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $NAME" "$PLIST"

# Bust macOS's LaunchServices cache for this binary so the Finder/Dock pick
# up the new name immediately instead of relying on a logout/reboot.
touch node_modules/electron/dist/Electron.app

echo "Patched $PLIST: CFBundleName -> $NAME"
