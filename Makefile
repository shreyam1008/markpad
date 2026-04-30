GO ?= /usr/local/go/bin/go
APP := markpad
MAIN := ./cmd/markpad
DIST := dist

.PHONY: run build test fmt clean wasm

run:
	$(GO) run $(MAIN)

build:
	mkdir -p $(DIST)
	$(GO) build -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) $(MAIN)

test:
	$(GO) test ./...

fmt:
	$(GO)fmt -w ./cmd ./internal

wasm:
	mkdir -p $(DIST)/web
	gogio -target js -o $(DIST)/web $(MAIN)

clean:
	rm -rf $(DIST)
