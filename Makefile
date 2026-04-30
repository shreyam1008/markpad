GO ?= /usr/local/go/bin/go
APP := markpad
MAIN := ./cmd/markpad
DIST := dist

.PHONY: run build build-linux-local test test-core fmt clean wasm

run:
	$(GO) run $(MAIN)

build:
	mkdir -p $(DIST)
	$(GO) build -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) $(MAIN)

build-linux-local:
	sh scripts/build-linux-local.sh

test:
	$(GO) test ./...

test-core:
	$(GO) test ./internal/markdown ./internal/preview ./internal/session ./tests

fmt:
	$(GO)fmt -w ./cmd ./internal

wasm:
	mkdir -p $(DIST)/web
	gogio -target js -o $(DIST)/web $(MAIN)

clean:
	rm -rf $(DIST)
