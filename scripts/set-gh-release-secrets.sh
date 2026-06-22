#!/usr/bin/env bash
# Push GitHub Actions release secrets for the MacPi release pipeline onto a
# repository, pulling each value from the macOS Keychain.
#
# Keychain layout (one entry per secret):
#   service:  GH-<SECRET_NAME>
#   account:  your login ($USER)
#   value:    the secret value (for .p12/.p8 this must already be base64-encoded)
#
# Add a secret to Keychain with:
#   security add-generic-password -s GH-DEVELOPER_ID_CERTIFICATE_P12 \
#       -a "$USER" -w "$(base64 -i /path/to/cert.p12)"
#
# These are the SAME secret names ThoughtBoard uses, so a Keychain already set
# up for that repo works here verbatim.
#
# Usage:
#   scripts/set-gh-release-secrets.sh              # apply to current repo
#   scripts/set-gh-release-secrets.sh owner/repo   # apply to specific repo

set -euo pipefail

# Required secrets — the workflow always needs these. (App Store Connect API
# Key notarization. If you use Apple ID notarization instead, replace the three
# APPSTORE_* names with APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID.)
SECRETS=(
    DEVELOPER_ID_CERTIFICATE_P12
    DEVELOPER_ID_CERTIFICATE_PASSWORD
    APPSTORE_API_KEY_P8_BASE64
    APPSTORE_API_KEY_ID
    APPSTORE_API_ISSUER_ID
)

# Optional secrets — applied only if present in the Keychain; their absence is
# not an error. RELEASE_REPO_TOKEN is the PAT (with `contents: write` on
# roaanv/releases) the workflow uses to mirror the .dmg to the central repo.
OPTIONAL_SECRETS=(
    RELEASE_REPO_TOKEN
)

repo="${1:-}"

if [ -z "$repo" ]; then
    repo=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
        echo "Error: not inside a GitHub repo and no owner/repo argument given." >&2
        echo "Usage: $0 [owner/repo]" >&2
        exit 1
    }
fi

echo "Applying release secrets to $repo..."

missing=()
for name in "${SECRETS[@]}"; do
    service="GH-$name"
    if ! value=$(security find-generic-password -s "$service" -w 2>/dev/null); then
        missing+=("$service")
        continue
    fi
    # gh secret set reads from stdin when --body is omitted (see `gh secret set --help`).
    # Use printf (not echo) to avoid the trailing newline that would corrupt base64.
    printf '%s' "$value" | gh secret set "$name" --repo "$repo"
    echo "  ✓ $name"
done

for name in "${OPTIONAL_SECRETS[@]}"; do
    service="GH-$name"
    if value=$(security find-generic-password -s "$service" -w 2>/dev/null); then
        printf '%s' "$value" | gh secret set "$name" --repo "$repo"
        echo "  ✓ $name (optional)"
    else
        echo "  - $name (optional, not in Keychain — skipped)"
    fi
done

if [ "${#missing[@]}" -gt 0 ]; then
    echo >&2
    echo "Error: missing Keychain entries:" >&2
    for entry in "${missing[@]}"; do
        echo "  - $entry" >&2
    done
    echo >&2
    echo "Add each with:" >&2
    echo "  security add-generic-password -s <service> -a \"\$USER\" -w '<value>'" >&2
    exit 1
fi

echo "Done."
