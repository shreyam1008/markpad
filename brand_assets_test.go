package main

import (
	"os"
	"strings"
	"testing"
)

func TestProductMarkIsConsistentAcrossFrontendAndPackaging(t *testing.T) {
	canonical, err := os.ReadFile("packaging/linux/markpad.svg")
	if err != nil {
		t.Fatal(err)
	}
	frontend, err := os.ReadFile("frontend/src/assets/markpad-mark.svg")
	if err != nil {
		t.Fatal(err)
	}
	normalize := func(source []byte) string {
		return strings.ReplaceAll(string(source), "\r\n", "\n")
	}
	if normalize(canonical) != normalize(frontend) {
		t.Fatal("frontend mark must match packaging/linux/markpad.svg; run packaging/icons/generate_icons.py")
	}

	index, err := os.ReadFile("frontend/index.html")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(index), `rel="icon" type="image/svg+xml" href="./src/assets/markpad-mark.svg"`) {
		t.Fatal("frontend index must use the canonical Markpad mark as its favicon")
	}
}

func TestWindowsResourcesShipForSupportedArchitectures(t *testing.T) {
	for _, path := range []string{"rsrc_windows_amd64.syso", "rsrc_windows_arm64.syso"} {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("missing %s: regenerate Windows resources before building", path)
		}
		if info.Size() < 1_000 {
			t.Fatalf("%s does not contain a usable icon resource", path)
		}
	}
}

func TestPlatformPackagesReferenceTheMarkpadIcon(t *testing.T) {
	assets := []struct {
		path    string
		minimum int64
	}{
		{"packaging/windows/markpad.ico", 1_000},
		{"packaging/macos/markpad.icns", 1_000},
		{"packaging/linux/markpad.svg", 100},
	}
	for _, asset := range assets {
		info, err := os.Stat(asset.path)
		if err != nil {
			t.Fatalf("missing platform icon %s", asset.path)
		}
		if info.Size() < asset.minimum {
			t.Fatalf("platform icon %s is unexpectedly small", asset.path)
		}
	}

	references := []struct {
		path string
		want string
	}{
		{"packaging/windows/installer.nsi", "packaging\\windows\\markpad.ico"},
		{"packaging/macos/Info.plist", "<string>markpad</string>"},
		{"packaging/linux/markpad.desktop", "Icon=markpad"},
	}
	for _, reference := range references {
		content, err := os.ReadFile(reference.path)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(content), reference.want) {
			t.Fatalf("%s must reference %q", reference.path, reference.want)
		}
	}
}
