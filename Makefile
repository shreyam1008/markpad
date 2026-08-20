GO ?= go
GOFMT ?= gofmt
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

test: frontend-build
	$(GO) test -tags $(TAGS) . ./internal/... ./tests
	cd $(FRONTEND) && $(BUN) run test

test-core:
	$(GO) test ./internal/session ./tests

lint:
	cd $(FRONTEND) && $(BUN) run lint

fmt:
	$(GOFMT) -w $$(rg --files -g '*.go')
	cd $(FRONTEND) && $(BUN) run fmt

fmt-check:
	@unformatted="$$($(GOFMT) -l $$(rg --files -g '*.go'))"; \
	if [ -n "$$unformatted" ]; then \
		echo "Go files need formatting:"; \
		echo "$$unformatted"; \
		exit 1; \
	fi
	cd $(FRONTEND) && $(BUN) run fmt:check

check: frontend-build test lint fmt-check check-assets check-size

check-assets:
	@if rg -n "<(script|img)[^>]+src=[\"']https?://|<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']https?://|(@import|url\\()[^;)]*https?://|(^|[[:space:]])(import|from)[[:space:]]+[\"']https?://" $(FRONTEND)/index.html $(FRONTEND)/src; then \
		echo "runtime network dependency found"; \
		exit 1; \
	fi

check-size: build
	@bytes=$$(wc -c < $(DIST)/$(APP) | tr -d '[:space:]'); \
	limit=$$((15 * 1024 * 1024)); \
	if [ "$$bytes" -gt "$$limit" ]; then \
		echo "$(DIST)/$(APP) exceeds the 15 MiB release ceiling ($$bytes bytes)"; \
		exit 1; \
	fi; \
	echo "$(DIST)/$(APP): $$bytes bytes (15 MiB ceiling)"

clean:
	rm -rf $(DIST) $(FRONTEND)/dist
