# macpi — top-level Makefile.
# Canonical commands per project conventions: `make build`, `make run`.

.PHONY: setup build run run-packaged test test-all lint format typecheck clean deploy dmg release release-minor gh-secrets

setup:
	npm install

build:
	npm run package

run:
	npm start

# Build and run the packaged .app. This is the closest local approximation of
# production bundle behavior, including the final Dock / app switcher identity.
run-packaged: build
	bash scripts/run-packaged-app.sh

test:
	npm test

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

clean:
	rm -rf out .vite dist node_modules/.cache

# Copy the packaged MacPi.app from out/ to ~/Applications/. Run `make build`
# first; deploy intentionally does NOT trigger a rebuild so iterations stay
# fast. Replaces an existing ~/Applications/MacPi.app in place.
deploy:
	@APP_PATH=$$(find out -maxdepth 4 -name "MacPi.app" -type d 2>/dev/null | head -1); \
	if [ -z "$$APP_PATH" ]; then \
		echo "deploy: no MacPi.app found in out/ — run 'make build' first" >&2; \
		exit 1; \
	fi; \
	DEST="$$HOME/Applications/MacPi.app"; \
	mkdir -p "$$HOME/Applications"; \
	if [ -e "$$DEST" ]; then echo "Removing existing $$DEST"; rm -rf "$$DEST"; fi; \
	echo "Copying $$APP_PATH → $$DEST"; \
	cp -R "$$APP_PATH" "$$DEST"; \
	echo "Deployed: $$DEST"

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

# Cut a release: bump the patch version (x.y.Z), commit, tag, and push. The
# v* tag triggers .github/workflows/release.yml, which builds a signed +
# notarized .dmg and publishes it to this repo and to roaanv/releases.
# Releases must be cut from a clean `main` by default; override with
# RELEASE_BRANCH (e.g. `RELEASE_BRANCH=release make release`).
release:
	bash scripts/bump-version.sh patch

# Same as `release` but bumps the minor version (x.Y.0).
release-minor:
	bash scripts/bump-version.sh minor

# Push the Apple signing + notarization secrets from your macOS Keychain to the
# GitHub repo, so the release workflow can sign and notarize. One-time setup
# (re-run whenever a secret rotates). Requires the gh CLI, authenticated.
gh-secrets:
	@command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI not found. Install with: brew install gh"; exit 1; }
	@gh auth status >/dev/null 2>&1 || { echo "Error: gh CLI is not authenticated. Run: gh auth login"; exit 1; }
	@if ! gh repo view --json nameWithOwner -q .nameWithOwner >/dev/null 2>&1; then \
		echo "Skipping gh-secrets: this repository doesn't exist on GitHub yet."; \
		echo "Create it first with: gh repo create --source . --private --push"; \
		exit 0; \
	fi
	bash scripts/set-gh-release-secrets.sh
