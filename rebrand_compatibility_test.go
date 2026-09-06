package main

import (
	"os"
	"strings"
	"testing"
)

// TestRebrandPreservesDurableIdentities makes the display-name boundary
// explicit. These values are used by existing installations and must not be
// renamed without a separate, platform-tested migration.
func TestRebrandPreservesDurableIdentities(t *testing.T) {
	t.Parallel()

	checks := []struct {
		path string
		want []string
	}{
		{"go.mod", []string{"module markpad\n"}},
		{"Makefile", []string{"APP := markpad"}},
		{"wails.json", []string{"\"name\": \"markpad\"", "\"outputfilename\": \"markpad\""}},
		{"install.sh", []string{
			"REPO=\"shreyam1008/markpad\"",
			"releases/download/$TAG/markpad",
			"$BIN_DIR/markpad",
		}},
		{"packaging/linux/markpad.desktop", []string{"Exec=markpad %F", "Icon=markpad"}},
		{"packaging/linux/io.github.markpad.metainfo.xml", []string{
			"<id>io.github.markpad</id>",
			"<launchable type=\"desktop-id\">markpad.desktop</launchable>",
		}},
		{"packaging/macos/Info.plist", []string{
			"<string>markpad</string>",
			"<string>io.github.markpad</string>",
		}},
		{"packaging/windows/installer.nsi", []string{
			"InstallDir \"$PROGRAMFILES\\Markpad\"",
			"InstallDirRegKey HKLM \"Software\\Markpad\" \"InstallDir\"",
			"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Markpad",
		}},
		{"packaging/scoop/markpad.json", []string{
			"https://github.com/shreyam1008/markpad/releases/download/v0.9.2/markpad-setup.exe",
			"C:\\\\Program Files\\\\Markpad\\\\markpad.exe",
		}},
		{"packaging/winget/manifests/s/ShreyamAdhikari/Markpad/0.9.2/ShreyamAdhikari.Markpad.yaml", []string{
			"PackageIdentifier: ShreyamAdhikari.Markpad",
		}},
		{"docs/index.html", []string{
			"<link rel=\"canonical\" href=\"https://quillpane.shreyam1008.com.np/\" />",
		}},
	}

	for _, check := range checks {
		check := check
		t.Run(check.path, func(t *testing.T) {
			t.Parallel()
			content, err := os.ReadFile(check.path)
			if err != nil {
				t.Fatal(err)
			}
			normalized := strings.ReplaceAll(string(content), "\r\n", "\n")
			for _, want := range check.want {
				if !strings.Contains(normalized, want) {
					t.Fatalf("%s no longer contains protected identity %q", check.path, want)
				}
			}
		})
	}
}
