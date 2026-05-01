package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const Version = "0.5"

//go:embed all:frontend
var assets embed.FS

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-v") {
		fmt.Println(Version)
		os.Exit(0)
	}

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
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(cd *menu.CallbackData) {
		runtime.Quit(app.ctx)
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
	helpMenu.AddText("About", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:about")
	})

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
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
