package main

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"
)

// TestRebrandPreservesDurableIdentities makes the display-name boundary
// explicit. These values are used by existing installations and must not be
// renamed without a separate, platform-tested migration.
func TestRebrandPreservesDurableIdentities(t *testing.T) {
	t.Parallel()
	// Scoop must keep the last verified installer until the next release artifact
	// exists. Validate its own version/hash without requiring a future download.
	scoopBytes, err := os.ReadFile("packaging/scoop/markpad.json")
	if err != nil {
		t.Fatal(err)
	}
	var scoop struct {
		Version      string `json:"version"`
		Architecture map[string]struct {
			URL  string `json:"url"`
			Hash string `json:"hash"`
		} `json:"architecture"`
	}
	if err := json.Unmarshal(scoopBytes, &scoop); err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(scoop.Version) {
		t.Fatal("Scoop must declare a release version")
	}
	installer := scoop.Architecture["64bit"]
	wantURL := "https://github.com/shreyam1008/markpad/releases/download/v" + scoop.Version + "/markpad-setup.exe"
	if installer.URL != wantURL {
		t.Fatalf("Scoop installer identity/version mismatch: %s", installer.URL)
	}
	if hash, err := hex.DecodeString(installer.Hash); err != nil || len(hash) != 32 || strings.Trim(installer.Hash, "0") == "" {
		t.Fatal("Scoop must retain a non-placeholder installer SHA256")
	}

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
			wantURL,
			"C:\\\\Program Files (x86)\\\\Markpad\\\\markpad.exe",
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
