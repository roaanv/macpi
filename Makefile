# macpi — top-level Makefile.
# Canonical commands per project conventions: `make build`, `make run`.

.PHONY: setup build run test test-all lint format typecheck clean deploy

setup:
	npm install

build:
	npm run package

run:
	npm start

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
