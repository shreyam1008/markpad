GO ?= /usr/local/go/bin/go
WAILS ?= $(HOME)/go/bin/wails
BUN ?= bun
APP := markpad
DIST := dist
TAGS := production,webkit2_41
FRONTEND := frontend

.PHONY: setup frontend-build run dev build test test-core lint fmt fmt-check check clean check-assets check-size

setup:
	cd $(FRONTEND) && $(BUN) install --frozen-lockfile

frontend-build:
	@test -d $(FRONTEND)/node_modules || (echo "frontend dependencies missing; run 'make setup'" && exit 1)
	cd $(FRONTEND) && $(BUN) run build

run: frontend-build
	mkdir -p $(DIST)
	$(GO) build -tags $(TAGS) -o $(DIST)/$(APP) . && ./$(DIST)/$(APP)

dev:
	$(WAILS) dev

build: frontend-build
	mkdir -p $(DIST)
	$(GO) build -tags $(TAGS) -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) .

test:
	$(GO) test ./internal/session ./tests

test-core:
	$(GO) test ./internal/session ./tests

lint:
	cd $(FRONTEND) && $(BUN) run lint

fmt:
	$(GO)fmt -w . ./internal
	cd $(FRONTEND) && $(BUN) run fmt

fmt-check:
	cd $(FRONTEND) && $(BUN) run fmt:check

check: test lint fmt-check frontend-build

check-assets:
	@if rg -n '(src|href)=["''']https?://|from ["''']https?://' $(FRONTEND)/index.html $(FRONTEND)/src; then \
		echo "runtime network dependency found"; \
		exit 1; \
	fi

check-size: build
	@bytes=$$(stat -c %s $(DIST)/$(APP)); \
	limit=$$((15 * 1024 * 1024)); \
	if [ "$$bytes" -gt "$$limit" ]; then \
		echo "$(DIST)/$(APP) exceeds the 15 MiB release ceiling ($$bytes bytes)"; \
		exit 1; \
	fi

clean:
	rm -rf $(DIST) $(FRONTEND)/dist
