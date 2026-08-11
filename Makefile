GO ?= /usr/local/go/bin/go
WAILS ?= $(HOME)/go/bin/wails
APP := markpad
DIST := dist
TAGS := production,webkit2_41

.PHONY: run dev build css test test-core fmt clean

run:
	$(GO) build -tags $(TAGS) -o $(DIST)/$(APP) . && ./$(DIST)/$(APP)

dev:
	$(WAILS) dev

build:
	mkdir -p $(DIST)
	$(GO) build -tags $(TAGS) -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) .

css:
	npx --yes tailwindcss@3.4.17 -c frontend/tailwind.config.cjs -i frontend/src/tailwind.input.css -o frontend/src/tailwind.css --minify

test:
	$(GO) test ./internal/session ./tests

test-core:
	$(GO) test ./internal/session ./tests

fmt:
	$(GO)fmt -w . ./internal

clean:
	rm -rf $(DIST)

.PHONY: check-assets check-size
check-assets:
	@if rg -n 'https?://' frontend/index.html frontend/src --glob '*.js' --glob '*.css'; then \
		echo "runtime network dependency found"; \
		exit 1; \
	fi

check-size: build
	@bytes=$$(stat -c %s dist/markpad); \
	limit=$$((15 * 1024 * 1024)); \
	if [ "$$bytes" -gt "$$limit" ]; then \
		echo "dist/markpad exceeds the 15 MiB release ceiling ($$bytes bytes)"; \
		exit 1; \
	fi
