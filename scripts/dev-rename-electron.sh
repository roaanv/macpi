#!/usr/bin/env bash
# Prepare a dedicated macOS dev Electron bundle that shows "MacPi" in the
# Dock / app switcher without mutating node_modules/electron in place.
#
# This copies Electron.app into .dev-electron/MacPi.app, patches the copied
# bundle metadata, and duplicates the executable to a MacPi-named binary.
# electron-forge start is then pointed at .dev-electron via
# ELECTRON_OVERRIDE_DIST_PATH by scripts/dev-start-electron.sh.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
	exit 0
fi

NAME="MacPi"
BUNDLE_ID="io.0112.macpi.dev"
SRC_APP="node_modules/electron/dist/Electron.app"
DEV_DIST_DIR=".dev-electron"
DST_APP="$DEV_DIST_DIR/$NAME.app"
PLIST="$DST_APP/Contents/Info.plist"
SRC_BIN="$DST_APP/Contents/MacOS/Electron"
DST_BIN="$DST_APP/Contents/MacOS/$NAME"

if [[ ! -d "$SRC_APP" ]]; then
	echo "error: $SRC_APP not found. Run npm install first." >&2
	exit 1
fi

rm -rf "$DEV_DIST_DIR"
mkdir -p "$DEV_DIST_DIR"
cp -R "$SRC_APP" "$DST_APP"

if [[ ! -f "$PLIST" || ! -f "$SRC_BIN" ]]; then
	echo "error: copied Electron bundle is missing expected files" >&2
	exit 1
fi

cp -f "$SRC_BIN" "$DST_BIN"
chmod +x "$DST_BIN"

/usr/libexec/PlistBuddy -c "Set :CFBundleName $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $BUNDLE_ID" "$PLIST"

codesign --force --deep --sign - "$DST_APP" >/dev/null 2>&1 || true

touch "$DST_APP"

echo "Prepared dev Electron bundle: $DST_APP"
