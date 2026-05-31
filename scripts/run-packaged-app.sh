#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

APP_PATH="$(python3 - <<'PY'
from pathlib import Path
apps = sorted(Path('out').glob('**/MacPi.app'))
print(apps[0] if apps else '')
PY
)"

if [[ -z "$APP_PATH" ]]; then
	echo "run-packaged: no MacPi.app found under out/ — run 'make build' first" >&2
	exit 1
fi

open "$APP_PATH"
echo "Opened packaged app: $APP_PATH"
