package main

import (
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

func TestNativeApplicationMenuHiddenOnLinux(t *testing.T) {
	appMenu := menu.NewMenu()

	if got := nativeApplicationMenu("linux", appMenu); got != nil {
		t.Fatal("nativeApplicationMenu(linux) should hide the GTK menu above the custom title bar")
	}
}

func TestNativeApplicationMenuKeptOnOtherPlatforms(t *testing.T) {
	appMenu := menu.NewMenu()

	for _, goos := range []string{"darwin", "windows"} {
		if got := nativeApplicationMenu(goos, appMenu); got != appMenu {
			t.Fatalf("nativeApplicationMenu(%s) should keep the native application menu", goos)
		}
	}
}
