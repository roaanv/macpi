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

deploy:
	# Packaging + DMG creation lands in plan 5. Until then this is a placeholder
	# that fails loudly so it can never be confused with a real release.
	@echo "deploy: not implemented in foundation milestone (lands in plan 5)" && exit 1
