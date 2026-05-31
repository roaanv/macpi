#!/usr/bin/env bash
# Patch the dev-mode Electron bundle so the macOS Dock and app switcher show
# "MacPi" instead of "Electron" during `npm start`.
#
# In dev, Electron Forge launches the binary from node_modules/electron/dist.
# macOS derives the visible application/process name from the bundle metadata
# and executable before our JS runs, so app.setName() cannot fix this at
# runtime.
#
# We patch the existing Electron.app in place, duplicate the executable to a
# MacPi-named binary, update Info.plist, and rewrite electron/path.txt so the
# `electron` package returns the renamed binary. The stock Electron binary is
# kept in place so the install remains healthy even if other tooling expects it.
#
# Runs as a postinstall step so the patch survives reinstalls of the electron
# package. Silent no-op on non-macOS hosts.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
	exit 0
fi

NAME="MacPi"
DIST_DIR="node_modules/electron/dist"
APP_DIR="$DIST_DIR/Electron.app"
PATH_FILE="node_modules/electron/path.txt"
DEFAULT_BIN="$APP_DIR/Contents/MacOS/Electron"
TARGET_BIN="$APP_DIR/Contents/MacOS/$NAME"
TARGET_BIN_REL="Electron.app/Contents/MacOS/$NAME"
PLIST="$APP_DIR/Contents/Info.plist"

if [[ ! -d "$APP_DIR" || ! -f "$PLIST" ]]; then
	# Electron not installed yet (or layout changed); not our problem.
	exit 0
fi

if [[ -f "$DEFAULT_BIN" ]]; then
	cp -f "$DEFAULT_BIN" "$TARGET_BIN"
	chmod +x "$TARGET_BIN"
elif [[ -f "$TARGET_BIN" && ! -f "$DEFAULT_BIN" ]]; then
	cp -f "$TARGET_BIN" "$DEFAULT_BIN"
	chmod +x "$DEFAULT_BIN"
fi

# Defensive cleanup from older script revisions that renamed the bundle.
if [[ -d "$DIST_DIR/$NAME.app" && "$DIST_DIR/$NAME.app" != "$APP_DIR" ]]; then
	rm -rf "$DIST_DIR/$NAME.app"
fi

/usr/libexec/PlistBuddy -c "Set :CFBundleName $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $NAME" "$PLIST" 2>/dev/null \
	|| /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string $NAME" "$PLIST"

printf '%s\n' "$TARGET_BIN_REL" > "$PATH_FILE"

# Bust macOS's LaunchServices cache for this bundle so the Finder/Dock pick up
# the new name immediately instead of relying on a logout/reboot.
touch "$APP_DIR"

echo "Patched Electron dev bundle: $APP_DIR ($TARGET_BIN_REL)"
