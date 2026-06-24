GO ?= /usr/local/go/bin/go
WAILS ?= $(HOME)/go/bin/wails
APP := markpad
DIST := dist
TAGS := desktop,production,webkit2_41

.PHONY: run dev build profile-build profile-run profile-test css budget smoke-desktop memory startup test test-core vet js-check validate fmt clean

run:
	$(GO) build -tags $(TAGS) -o $(DIST)/$(APP) . && ./$(DIST)/$(APP)

dev:
	$(WAILS) dev

build:
	mkdir -p $(DIST)
	$(GO) build -tags $(TAGS) -trimpath -ldflags="-s -w" -o $(DIST)/$(APP) .

profile-build:
	mkdir -p $(DIST)
	$(GO) build -tags "$(TAGS),profile" -trimpath -ldflags="-s -w" -o $(DIST)/$(APP)-profile .

profile-run: profile-build
	MARKPAD_PROFILE=1 ./$(DIST)/$(APP)-profile

profile-test:
	$(GO) test -tags "$(TAGS),profile" ./...

css:
	npx --yes tailwindcss@3.4.17 -c tailwind.config.cjs -i frontend/src/tailwind.input.css -o frontend/src/tailwind.css --minify

budget:
	sh scripts/budget.sh

smoke-desktop: build
	sh scripts/smoke-desktop.sh

memory: build
	sh scripts/measure-memory.sh

startup: build
	sh scripts/measure-startup.sh

test:
	$(GO) test ./internal/session ./tests

test-core:
	$(GO) test ./internal/session ./tests

vet:
	$(GO) vet ./...

js-check:
	node --check frontend/src/main.js

validate:
	$(GO) test ./internal/session ./tests
	$(GO) test ./...
	$(GO) test -tags $(TAGS) ./...
	$(GO) vet ./...
	node --check frontend/src/main.js
	$(MAKE) build
	$(MAKE) budget

fmt:
	$(GO)fmt -w . ./internal

clean:
	rm -rf $(DIST)
