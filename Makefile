GO ?= go
GOFMT ?= gofmt
WAILS ?= $(shell $(GO) env GOPATH)/bin/wails
BUN ?= bun
APP := markpad
DIST := dist
TAGS := production,webkit2_41
TEST_TAGS := webkit2_41
FRONTEND := frontend
BINARY_SIZE_LIMIT ?= 15728640
FRONTEND_SIZE_LIMIT ?= 524288

.PHONY: setup frontend-build run dev build test test-core typecheck frontend-test lint fmt go-fmt-check fmt-check frontend-check check check-ci clean check-assets check-frontend-size check-size

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
	$(GO) test -tags $(TEST_TAGS) ./...

test-core:
	$(GO) test ./internal/session ./tests

typecheck:
	cd $(FRONTEND) && $(BUN) run typecheck

frontend-test:
	cd $(FRONTEND) && $(BUN) run test

lint:
	cd $(FRONTEND) && $(BUN) run lint

fmt:
	$(GOFMT) -w $$(rg --files -g '*.go' -g '!ports/**')
	cd $(FRONTEND) && $(BUN) run fmt

go-fmt-check:
	@command -v rg >/dev/null 2>&1 || { echo "go-fmt-check requires ripgrep (rg)"; exit 1; }
	@files=$$($(GOFMT) -l $$(rg --files -g '*.go' -g '!ports/**')); \
	if [ -n "$$files" ]; then \
		echo "Go files need formatting:"; \
		echo "$$files"; \
		exit 1; \
	fi

fmt-check:
	cd $(FRONTEND) && $(BUN) run fmt:check

frontend-check: typecheck frontend-test lint fmt-check check-assets

check: go-fmt-check frontend-check test check-frontend-size

check-ci: go-fmt-check frontend-check check-frontend-size
	$(GO) test -tags $(TEST_TAGS) ./...
	$(GO) test -race -tags $(TEST_TAGS) ./...
	$(GO) vet -tags $(TEST_TAGS) ./...

check-assets:
	@command -v rg >/dev/null 2>&1 || { echo "check-assets requires ripgrep (rg)"; exit 1; }
	@if rg -n "src=['\"]https?://|<link[^>]*href=['\"]https?://|from ['\"]https?://|@import ['\"]https?://|url\\(['\"]?https?://" $(FRONTEND)/index.html $(FRONTEND)/src; then \
		echo "runtime network dependency found"; \
		exit 1; \
	fi

check-frontend-size: frontend-build
	@bytes=$$(find $(FRONTEND)/dist -type f -exec wc -c {} \; | awk '{ total += $$1 } END { print total + 0 }'); \
	if [ "$$bytes" -gt "$(FRONTEND_SIZE_LIMIT)" ]; then \
		echo "$(FRONTEND)/dist exceeds the raw frontend ceiling of $(FRONTEND_SIZE_LIMIT) bytes ($$bytes bytes)"; \
		exit 1; \
	fi; \
	echo "$(FRONTEND)/dist raw size: $$bytes bytes (limit: $(FRONTEND_SIZE_LIMIT))"

check-size: build
	@bytes=$$(wc -c < $(DIST)/$(APP) | tr -d '[:space:]'); \
	if [ "$$bytes" -gt "$(BINARY_SIZE_LIMIT)" ]; then \
		echo "$(DIST)/$(APP) exceeds the 15 MiB release ceiling ($$bytes bytes)"; \
		exit 1; \
	fi

clean:
	rm -rf $(DIST) $(FRONTEND)/dist
