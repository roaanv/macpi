#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
	exec electron-forge start
fi

bash scripts/dev-rename-electron.sh

PATH_FILE="node_modules/electron/path.txt"
ORIGINAL_PATH=""
if [[ -f "$PATH_FILE" ]]; then
	ORIGINAL_PATH="$(<"$PATH_FILE")"
fi

cleanup() {
	if [[ -n "$ORIGINAL_PATH" ]]; then
		printf '%s' "$ORIGINAL_PATH" > "$PATH_FILE"
	fi
}
trap cleanup EXIT

printf '%s' 'MacPi.app/Contents/MacOS/MacPi' > "$PATH_FILE"
export ELECTRON_OVERRIDE_DIST_PATH="$PWD/.dev-electron"

electron-forge start
