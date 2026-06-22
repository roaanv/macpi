#!/usr/bin/env bash
# Bump MacPi's version, commit, tag, and push — which triggers the release
# workflow (.github/workflows/release.yml fires on v* tags, builds a signed +
# notarized .dmg, and publishes it to this repo and to roaanv/releases).
#
# The version source of truth is package.json — the value electron-forge stamps
# into the packaged app and the .dmg name. `npm version` keeps package-lock.json
# in sync automatically.
#
# Releases are cut from a clean main by default. Override the required branch
# with RELEASE_BRANCH (e.g. to cut from the current `release` branch):
#   RELEASE_BRANCH=release scripts/bump-version.sh patch
#
# Usage:
#   scripts/bump-version.sh patch            # 1.0.0 -> 1.0.1
#   scripts/bump-version.sh minor            # 1.0.0 -> 1.1.0
#   DRY_RUN=1 scripts/bump-version.sh patch  # print the plan; no writes, no push

set -euo pipefail

KIND="${1:-}"
case "$KIND" in
    patch | minor) ;;
    *)
        echo "Usage: $0 <patch|minor>" >&2
        exit 1
        ;;
esac

[ -f package.json ] || {
    echo "Error: package.json not found — run from the repo root." >&2
    exit 1
}

RELEASE_BRANCH="${RELEASE_BRANCH:-main}"

# Guardrails: cut releases from a clean branch, so the tag matches exactly what
# is committed and `git push` carries the bump commit. (The CI workflow reads
# its job definition from the tagged commit's tree, so that commit must already
# contain .github/workflows/release.yml.)
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "$RELEASE_BRANCH" ]; then
    echo "Error: on branch '$branch'; releases must be cut from '$RELEASE_BRANCH'." >&2
    echo "       Set RELEASE_BRANCH to override (e.g. RELEASE_BRANCH=$branch $0 $KIND)." >&2
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: working tree is dirty. Commit or stash changes first." >&2
    exit 1
fi

# Compute current + next version (node parses the JSON robustly).
CUR=$(node -p "require('./package.json').version")
read -r NEXT < <(node -e '
  const [cur, kind] = process.argv.slice(1);
  if (!/^\d+\.\d+\.\d+$/.test(cur)) {
    console.error("Unparseable version: " + cur);
    process.exit(1);
  }
  const [maj, min, pat] = cur.split(".").map(Number);
  const next = kind === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  // Trailing newline so `read` finds its delimiter and returns 0; without it
  // `read` exits 1 on EOF and `set -e` aborts the script silently.
  console.log(next);
' "$CUR" "$KIND")
[ -n "${NEXT:-}" ] || {
    echo "Error: failed to compute the next version." >&2
    exit 1
}

TAG="v$NEXT"
echo "Bumping $CUR -> $NEXT (tag $TAG)"

if [ -n "${DRY_RUN:-}" ]; then
    echo "[dry-run] would: bump package.json to $NEXT, commit, tag $TAG, push origin $branch + $TAG"
    exit 0
fi

# `npm version <explicit>` writes package.json + package-lock.json without
# creating its own commit/tag (we do that ourselves below).
npm version "$NEXT" --no-git-tag-version --allow-same-version >/dev/null

git add package.json package-lock.json
git commit -m "chore: release $TAG"
git tag -a "$TAG" -m "MacPi $TAG"
git push origin "$branch"
git push origin "$TAG"

echo "Pushed $TAG — the release workflow will build, sign, notarize, and publish it."
