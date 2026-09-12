package main

import (
	"fmt"
	"os"
	goruntime "runtime"
	"runtime/debug"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"markpad/internal/brand"
)

const Version = "0.13.6"

// Linker-overridable for isolated QA builds; releases always use the brand contract default.
var singleInstanceID = brand.SingleInstanceID

func nativeApplicationMenu(goos string, appMenu *menu.Menu) *menu.Menu {
	if goos == "linux" {
		return nil
	}
	return appMenu
}

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
	editMenu.AddSeparator()

	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Cycle View Mode", keys.Combo("e", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:toggleview")
	})
	viewMenu.AddText("Next Open File", keys.CmdOrCtrl("tab"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:nextfile")
	})
	viewMenu.AddText("Previous Open File", keys.Combo("tab", keys.CmdOrCtrlKey, keys.ShiftKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:previousfile")
	})
	viewMenu.AddText("Editor View", keys.CmdOrCtrl("1"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:vieweditor")
	})
	viewMenu.AddText("Split View", keys.CmdOrCtrl("2"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:viewsplit")
	})
	viewMenu.AddText("Preview View", keys.CmdOrCtrl("3"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:viewpreview")
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
	viewMenu.AddText("Increase Interface Scale", keys.CmdOrCtrl("="), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomin")
	})
	viewMenu.AddText("Decrease Interface Scale", keys.CmdOrCtrl("-"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomout")
	})
	viewMenu.AddText("Reset Interface Scale", keys.CmdOrCtrl("0"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:zoomreset")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Increase Text Size", keys.Combo("=", keys.CmdOrCtrlKey, keys.OptionOrAltKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:textzoomin")
	})
	viewMenu.AddText("Decrease Text Size", keys.Combo("-", keys.CmdOrCtrlKey, keys.OptionOrAltKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:textzoomout")
	})
	viewMenu.AddText("Reset Text Size", keys.Combo("0", keys.CmdOrCtrlKey, keys.OptionOrAltKey), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:textzoomreset")
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
		Title:            brand.ProductName,
		Width:            1180,
		Height:           760,
		MinWidth:         720,
		MinHeight:        480,
		Frameless:        true,
		BackgroundColour: options.NewRGB(240, 243, 240),
		Menu:             nativeApplicationMenu(goruntime.GOOS, appMenu),
		AssetServer: &assetserver.Options{
			Assets: frontendAssets(),
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               singleInstanceID,
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
