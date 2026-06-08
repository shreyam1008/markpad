package main

import (
	"embed"
	"fmt"
	"os"
	"runtime/debug"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const Version = "0.8"

//go:embed all:frontend
var assets embed.FS

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println(Version)
		os.Exit(0)
	}

	// Optimize WebKit memory consumption on Linux/Unix systems by disabling JIT compiler
	os.Setenv("JSC_useJIT", "0")
	os.Setenv("JavaScriptCoreUseJIT", "0")

	// Tune Go garbage collection to be more aggressive for memory savings
	debug.SetGCPercent(20)

	app := NewApp()

	appMenu := menu.NewMenu()

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New Note", keys.CmdOrCtrl("n"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:new")
	})
	fileMenu.AddText("Open...", keys.CmdOrCtrl("o"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:open")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Save", keys.CmdOrCtrl("s"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:save")
	})
	fileMenu.AddText("Save As...", keys.Combo("s", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:saveas")
	})
	fileMenu.AddText("Close File", keys.CmdOrCtrl("w"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:close")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(cd *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	editMenu := appMenu.AddSubmenu("Edit")
	editMenu.AddText("Undo", keys.CmdOrCtrl("z"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:undo")
	})
	editMenu.AddText("Redo", keys.Combo("z", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:redo")
	})

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Cycle View Mode", keys.Combo("e", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggleview")
	})
	viewMenu.AddText("Toggle Sidebar", keys.Combo("b", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:togglesidebar")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Find", keys.CmdOrCtrl("f"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:find")
	})
	viewMenu.AddText("Version History", keys.CmdOrCtrl("h"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:history")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Zoom In", keys.CmdOrCtrl("="), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomin")
	})
	viewMenu.AddText("Zoom Out", keys.CmdOrCtrl("-"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomout")
	})
	viewMenu.AddText("Reset Zoom", keys.CmdOrCtrl("0"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomreset")
	})

	settingsMenu := appMenu.AddSubmenu("Settings")
	settingsMenu.AddText("Preferences", keys.CmdOrCtrl(","), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:preferences")
	})

	helpMenu := appMenu.AddSubmenu("Help")
	helpMenu.AddText("Help", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:help")
	})
	helpMenu.AddText("Changelog", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:changelog")
	})
	helpMenu.AddSeparator()
	helpMenu.AddText("About", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:about")
	})

	// Handle CLI file arguments: open files passed on the command line
	var cliFiles []string
	for _, arg := range os.Args[1:] {
		if !strings.HasPrefix(arg, "-") {
			cliFiles = append(cliFiles, arg)
		}
	}
	app.pendingFiles = cliFiles

	err := wails.Run(&options.App{
		Title:     "Markpad",
		Width:     1180,
		Height:    760,
		MinWidth:  720,
		MinHeight: 480,
		Menu:      appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "c7b3e4a1-9f2d-4e8b-a6c1-markpad-single",
			OnSecondInstanceLaunch: app.onSecondInstanceLaunch,
		},
		OnStartup:     app.startup,
		OnShutdown:    app.shutdown,
		OnBeforeClose: app.beforeClose,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
