GO ?= /usr/local/go/bin/go
WAILS ?= $(HOME)/go/bin/wails
APP := markpad
DIST := dist

.PHONY: run dev build test test-core fmt clean

run:
	$(GO) build -o $(DIST)/$(APP) . && ./$(DIST)/$(APP)

dev:
	$(WAILS) dev

build:
	mkdir -p $(DIST)
	$(GO) build -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) .

test:
	$(GO) test ./internal/session ./tests

test-core:
	$(GO) test ./internal/session ./tests

fmt:
	$(GO)fmt -w . ./internal

clean:
	rm -rf $(DIST)
