package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"

	"github.com/ZenNotes/zennotes/apps/server/internal/config"
	"github.com/ZenNotes/zennotes/apps/server/internal/httpserver"
	"github.com/ZenNotes/zennotes/apps/server/internal/vault"
	"github.com/ZenNotes/zennotes/apps/server/internal/watcher"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	appName        = "shreyamnotes"
	productName    = "ShreyamNotes"
	appVersion     = "2.8.0-wails-phase1"
	defaultWidth   = 1280
	defaultHeight  = 820
	defaultMinW    = 980
	defaultMinH    = 620
	debugBootEnv   = "SHREYAMNOTES_DEBUG_BOOT"
	configEnv      = "ZENNOTES_CONFIG_PATH"
	defaultVault   = "ShreyamNotesVault"
	defaultCfgFile = "server.json"
)

//go:embed all:dist
var embeddedWeb embed.FS

type App struct {
	ctx     context.Context
	watcher *watcher.Watcher
}

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println(appVersion)
		return
	}

	// Match Markpad's memory posture: smaller resident set matters more than
	// peak JS throughput for the notes workflow.
	_ = os.Setenv("JSC_useJIT", "0")
	_ = os.Setenv("JavaScriptCoreUseJIT", "0")
	debug.SetGCPercent(25)

	ensureDesktopDefaults()

	cfg := config.Load()
	cfg.AuthToken = ""
	cfg.AllowInsecureNoAuth = true
	cfg.BasePath = ""
	cfg.Bind = "127.0.0.1:0"

	v, err := vault.New(cfg.VaultPath, vault.Options{
		FileMode:      cfg.VaultFileMode,
		DirMode:       cfg.VaultDirMode,
		MaxAssetBytes: cfg.MaxAssetBytes,
	})
	if err != nil {
		log.Fatalf("vault init: %v", err)
	}

	w := watcher.StartOrDisabled(v.Root(), cfg.DisableWatcher)
	app := &App{watcher: w}
	server := httpserver.New(v, w, nil, cfg)

	dist, err := fs.Sub(embeddedWeb, "dist")
	if err != nil {
		log.Fatalf("embedded web dist missing; run `make wails-build` from the port root first: %v", err)
	}

	if err := wails.Run(&options.App{
		Title:     productName,
		Width:     defaultWidth,
		Height:    defaultHeight,
		MinWidth:  defaultMinW,
		MinHeight: defaultMinH,
		Menu:      buildMenu(app),
		AssetServer: &assetserver.Options{
			Assets:  dist,
			Handler: server.Router(),
		},
		OnStartup:  app.startup,
		OnDomReady: app.domReady,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	}); err != nil {
		if !errors.Is(err, context.Canceled) {
			log.Fatalf("wails: %v", err)
		}
	}
}

func ensureDesktopDefaults() {
	if strings.TrimSpace(os.Getenv(configEnv)) == "" {
		if dir, err := os.UserConfigDir(); err == nil {
			_ = os.Setenv(configEnv, filepath.Join(dir, productName, defaultCfgFile))
		}
	}
	if strings.TrimSpace(os.Getenv("ZENNOTES_DEFAULT_VAULT_PATH")) == "" &&
		strings.TrimSpace(os.Getenv("ZENNOTES_VAULT_PATH")) == "" {
		if home, err := os.UserHomeDir(); err == nil {
			_ = os.Setenv("ZENNOTES_DEFAULT_VAULT_PATH", filepath.Join(home, defaultVault))
		}
	}
}

func buildMenu(app *App) *menu.Menu {
	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New Note", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		app.emit("wails:menu:new-note")
	})
	fileMenu.AddText("Search Notes", keys.CmdOrCtrl("p"), func(_ *menu.CallbackData) {
		app.emit("wails:menu:search-notes")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			wailsruntime.Quit(app.ctx)
		}
	})

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Zoom In", keys.CmdOrCtrl("="), func(_ *menu.CallbackData) {
		app.execJS("document.body.style.zoom = String((parseFloat(document.body.style.zoom || '1') || 1) + 0.1)")
	})
	viewMenu.AddText("Zoom Out", keys.CmdOrCtrl("-"), func(_ *menu.CallbackData) {
		app.execJS("document.body.style.zoom = String(Math.max(0.5, (parseFloat(document.body.style.zoom || '1') || 1) - 0.1))")
	})
	viewMenu.AddText("Reset Zoom", keys.CmdOrCtrl("0"), func(_ *menu.CallbackData) {
		app.execJS("document.body.style.zoom = '1'")
	})

	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("About ShreyamNotes", nil, func(_ *menu.CallbackData) {
		app.emit("wails:menu:about")
	})

	return appMenu
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) domReady(ctx context.Context) {
	if os.Getenv(debugBootEnv) != "1" {
		return
	}
	wailsruntime.WindowExecJS(ctx, `(function waitForShreyamNotesReady(startedAt) {
  try {
    const root = document.getElementById('root');
    const rect = root ? root.getBoundingClientRect() : null;
    const ready = !!root && root.children.length > 0 && rect && rect.width > 0 && rect.height > 0;
    if (!ready && performance.now() - startedAt < 60) {
      requestAnimationFrame(() => waitForShreyamNotesReady(startedAt));
      return;
    }
    const detail = {
      title: document.title,
      rootFound: !!root,
      rootChildren: root?.children?.length || 0,
      rootRect: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      bodyTextLength: document.body?.innerText?.trim()?.length || 0,
      href: window.location.href
    };
    window.runtime?.LogPrint?.('ShreyamNotes DOM probe ' + JSON.stringify(detail));
    console.info('ShreyamNotes DOM probe', detail);
  } catch (err) {
    window.runtime?.LogPrint?.('ShreyamNotes DOM probe error ' + (err?.message || err));
  }
})(performance.now());`)
}

func (a *App) shutdown(context.Context) {
	if a.watcher != nil {
		a.watcher.Close()
	}
}

func (a *App) GetAppInfo() map[string]string {
	return map[string]string{
		"name":        appName,
		"productName": productName,
		"version":     appVersion,
		"description": "Low-memory markdown notes with plain local files",
		"homepage":    "https://github.com/shreyam1008/shreyamnotes",
		"runtime":     "desktop",
	}
}

func (a *App) emit(name string) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, name)
}

func (a *App) execJS(script string) {
	if a.ctx == nil {
		return
	}
	wailsruntime.WindowExecJS(a.ctx, script)
}
