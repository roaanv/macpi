#!/usr/bin/env bash
# Regenerate platform icon artifacts from build/icon.png.
#
# Inputs:  build/icon.png  (square PNG, 1024+ px recommended)
# Outputs: build/icon.icns (macOS app bundle icon)
#
# Requires: iconutil + sips (preinstalled on macOS). The .iconset directory
# is intermediate — wiped at the end and gitignored so it never gets
# committed.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="build/icon.png"
ICONSET="build/icon.iconset"
ICNS="build/icon.icns"

if [[ ! -f "$SRC" ]]; then
    echo "error: $SRC not found" >&2
    exit 1
fi

if ! command -v iconutil >/dev/null || ! command -v sips >/dev/null; then
    echo "error: iconutil + sips required (macOS only)" >&2
    exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# Sizes required for a complete macOS .icns. Each entry is "name:size".
SIZES=(
    "icon_16x16.png:16"
    "icon_16x16@2x.png:32"
    "icon_32x32.png:32"
    "icon_32x32@2x.png:64"
    "icon_128x128.png:128"
    "icon_128x128@2x.png:256"
    "icon_256x256.png:256"
    "icon_256x256@2x.png:512"
    "icon_512x512.png:512"
    "icon_512x512@2x.png:1024"
)

for entry in "${SIZES[@]}"; do
    name="${entry%%:*}"
    size="${entry##*:}"
    sips -z "$size" "$size" "$SRC" --out "$ICONSET/$name" >/dev/null
done

iconutil -c icns -o "$ICNS" "$ICONSET"
rm -rf "$ICONSET"

echo "Generated $ICNS from $SRC"
