IMAGE ?= shreyamnotes-selfhosted:local
PORT ?= 7878
CONTENT_ROOT ?= ./vault
DATA ?= ./data
APP_URL ?= http://localhost:$(PORT)
ALLOW_INSECURE_NOAUTH ?= 0
WAILS_CMD := apps/server/cmd/shreyamnotes-wails
WAILS_BIN ?= dist/shreyamnotes
COMPOSE := $(shell docker compose version >/dev/null 2>&1 && echo "docker compose" || echo "docker-compose")
OPEN_BROWSER := $(shell command -v open 2>/dev/null || command -v xdg-open 2>/dev/null)

.PHONY: help install dev wails-dev web-dev server-dev web-stack \
	build web-build server-build \
	wails-web wails-build wails-run wails-size wails-clean \
	headless-web headless-server \
	up down restart logs status open rebuild nuke clean

help:
	@echo ""
	@echo "  Setup"
	@echo "    make install      — install Bun workspace dependencies"
	@echo ""
	@echo "  Local development"
	@echo "    make wails-dev    — build and run the Wails/WebKitGTK app"
	@echo "    make web-dev      — run the Vite web client in dev mode"
	@echo "    make server-dev   — run the Go server in dev mode"
	@echo "    make web-stack    — run server + web dev together"
	@echo ""
	@echo "  Local builds"
	@echo "    make build        — build the full monorepo"
	@echo "    make web-build    — build apps/web"
	@echo "    make server-build — build apps/server with the latest embedded web bundle"
	@echo "    make wails-build  — build the Wails/WebKitGTK app around the shared web/core runtime"
	@echo "    make wails-run    — run the Wails/WebKitGTK app"
	@echo "    make wails-size   — print binary and embedded web bundle sizes"
	@echo "    make headless-server — run web/core through Go server for Playwright screenshots"
	@echo ""
	@echo "  Docker"
	@echo "    make up       — build and start the self-hosted server"
	@echo "    make down     — stop the container"
	@echo "    make restart  — restart the container"
	@echo "    make logs     — follow logs"
	@echo "    make status   — show compose status"
	@echo "    make open     — open the app in your browser"
	@echo "    make rebuild  — force a full rebuild"
	@echo "    make nuke     — tear down and remove local image/build output"
	@echo "    make clean    — remove local web/server build output"
	@echo ""
	@echo "  Useful Docker vars"
	@echo "    CONTENT_ROOT=~/iCloud Drive/Obsidian   — host folder used as the live vault root"
	@echo "    PORT=7878                               — host port"
	@echo "    ALLOW_INSECURE_NOAUTH=1                 — opt out of generated auth token (not recommended)"
	@echo ""

install:
	bun install --frozen-lockfile

dev: wails-dev

wails-dev: wails-run

web-dev:
	bun run dev:web

server-dev:
	bun run dev:server

web-stack:
	bun run dev:web-stack

build:
	bun run build

web-build:
	bun --filter @zennotes/web build

up:
	@mkdir -p "$(CONTENT_ROOT)" "$(DATA)"
	@ABS_CONTENT_ROOT="$$(cd "$(CONTENT_ROOT)" && pwd)"; \
	ABS_DATA="$$(cd "$(DATA)" && pwd)"; \
	AUTH_TOKEN=""; \
	if [ "$(ALLOW_INSECURE_NOAUTH)" != "1" ]; then \
		AUTH_TOKEN_FILE="$$ABS_DATA/auth-token"; \
		if [ ! -f "$$AUTH_TOKEN_FILE" ]; then \
			bun -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > "$$AUTH_TOKEN_FILE"; \
			chmod 600 "$$AUTH_TOKEN_FILE"; \
		fi; \
		AUTH_TOKEN="$$(cat "$$AUTH_TOKEN_FILE")"; \
	fi; \
	ZENNOTES_IMAGE="$(IMAGE)" \
	ZENNOTES_HOST_PORT="$(PORT)" \
	ZENNOTES_HOST_CONTENT_ROOT="$$ABS_CONTENT_ROOT" \
	ZENNOTES_CONTAINER_CONTENT_ROOT="$$ABS_CONTENT_ROOT" \
	ZENNOTES_CONTAINER_DEFAULT_VAULT_PATH="$$ABS_CONTENT_ROOT" \
	ZENNOTES_BROWSE_ROOTS="$$ABS_CONTENT_ROOT" \
	ZENNOTES_ALLOWED_ORIGINS="http://localhost:$(PORT),http://127.0.0.1:$(PORT)" \
	ZENNOTES_AUTH_TOKEN="$$AUTH_TOKEN" \
	ZENNOTES_ALLOW_INSECURE_NOAUTH="$(ALLOW_INSECURE_NOAUTH)" \
	ZENNOTES_HOST_DATA="$$ABS_DATA" \
	ZENNOTES_CONTAINER_UID="$$(id -u)" \
	ZENNOTES_CONTAINER_GID="$$(id -g)" \
	$(COMPOSE) up --build -d
	@printf "\nShreyamNotes is running at $(APP_URL)\n\n"
ifneq ($(ALLOW_INSECURE_NOAUTH),1)
	@printf "Auth token: $(DATA)/auth-token\n\n"
endif
ifneq ($(strip $(OPEN_BROWSER)),)
	@$(OPEN_BROWSER) $(APP_URL) >/dev/null 2>&1 || true
endif

down:
	@$(COMPOSE) down

restart:
	@$(COMPOSE) restart zennotes 2>/dev/null || $(MAKE) --no-print-directory up

logs:
	@$(COMPOSE) logs -f

status:
	@$(COMPOSE) ps

open:
ifneq ($(strip $(OPEN_BROWSER)),)
	@$(OPEN_BROWSER) $(APP_URL)
else
	@echo "Open $(APP_URL) manually."
endif

rebuild:
	@mkdir -p "$(CONTENT_ROOT)" "$(DATA)"
	@ABS_CONTENT_ROOT="$$(cd "$(CONTENT_ROOT)" && pwd)"; \
	ABS_DATA="$$(cd "$(DATA)" && pwd)"; \
	AUTH_TOKEN=""; \
	if [ "$(ALLOW_INSECURE_NOAUTH)" != "1" ]; then \
		AUTH_TOKEN_FILE="$$ABS_DATA/auth-token"; \
		if [ ! -f "$$AUTH_TOKEN_FILE" ]; then \
			bun -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" > "$$AUTH_TOKEN_FILE"; \
			chmod 600 "$$AUTH_TOKEN_FILE"; \
		fi; \
		AUTH_TOKEN="$$(cat "$$AUTH_TOKEN_FILE")"; \
	fi; \
	ZENNOTES_IMAGE="$(IMAGE)" \
	ZENNOTES_HOST_PORT="$(PORT)" \
	ZENNOTES_HOST_CONTENT_ROOT="$$ABS_CONTENT_ROOT" \
	ZENNOTES_CONTAINER_CONTENT_ROOT="$$ABS_CONTENT_ROOT" \
	ZENNOTES_CONTAINER_DEFAULT_VAULT_PATH="$$ABS_CONTENT_ROOT" \
	ZENNOTES_BROWSE_ROOTS="$$ABS_CONTENT_ROOT" \
	ZENNOTES_ALLOWED_ORIGINS="http://localhost:$(PORT),http://127.0.0.1:$(PORT)" \
	ZENNOTES_AUTH_TOKEN="$$AUTH_TOKEN" \
	ZENNOTES_ALLOW_INSECURE_NOAUTH="$(ALLOW_INSECURE_NOAUTH)" \
	ZENNOTES_HOST_DATA="$$ABS_DATA" \
	ZENNOTES_CONTAINER_UID="$$(id -u)" \
	ZENNOTES_CONTAINER_GID="$$(id -g)" \
	$(COMPOSE) build --no-cache
	@$(MAKE) --no-print-directory up

nuke:
	@$(COMPOSE) down --rmi local --volumes || true
	@rm -rf apps/web/dist apps/server/bin apps/server/web/dist $(DATA)

server-build: web-build
	bun --filter @zennotes/server build

headless-web:
	bun --filter @zennotes/web build
	rm -rf apps/server/web/dist
	mkdir -p apps/server/web/dist
	cp -R apps/web/dist/. apps/server/web/dist/

headless-server: headless-web
	mkdir -p /tmp/shreyamnotes-headless-vault /tmp/shreyamnotes-headless-config
	cd apps/server && ZENNOTES_BIND=127.0.0.1:8788 ZENNOTES_VAULT_PATH=/tmp/shreyamnotes-headless-vault ZENNOTES_CONFIG_PATH=/tmp/shreyamnotes-headless-config/server.json ZENNOTES_ALLOW_INSECURE_NOAUTH=1 go run ./cmd/zennotes-server

wails-web:
	bun --filter @zennotes/web build
	rm -rf "$(WAILS_CMD)/dist"
	mkdir -p "$(WAILS_CMD)/dist"
	cp -R apps/web/dist/. "$(WAILS_CMD)/dist/"

wails-build: wails-web
	mkdir -p dist
	cd apps/server && go build -tags "desktop,production,webkit2_41" -trimpath -ldflags "-s -w" -o ../../$(WAILS_BIN) ./cmd/shreyamnotes-wails

wails-run: wails-build
	SHREYAMNOTES_DEBUG_BOOT=1 "./$(WAILS_BIN)"

wails-size:
	@test -f "$(WAILS_BIN)" && stat -c '%n %s bytes' "$(WAILS_BIN)" || { echo "missing $(WAILS_BIN); run make wails-build"; exit 1; }
	@du -sh "$(WAILS_CMD)/dist" "$(WAILS_BIN)"

wails-clean:
	rm -rf "$(WAILS_CMD)/dist" "$(WAILS_BIN)"

clean:
	rm -rf apps/web/dist apps/server/bin apps/server/web/dist "$(WAILS_CMD)/dist" "$(WAILS_BIN)"
