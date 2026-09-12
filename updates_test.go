package main

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPortableUpdateReplacesTheExistingPath(t *testing.T) {
	dir := t.TempDir()
	source, target := filepath.Join(dir, "download"), filepath.Join(dir, "markpad")
	if err := os.WriteFile(source, []byte("new binary"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old binary"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := replacePortableUpdate(source, target); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(target)
	if err != nil || string(data) != "new binary" {
		t.Fatalf("updated target: %q, %v", data, err)
	}
	if err := replacePortableUpdate(source, "relative-target"); err == nil {
		t.Fatal("accepted relative installation path")
	}
	if err := replacePortableUpdate(source, dir); err == nil {
		t.Fatal("accepted directory installation path")
	}
}

func TestLinuxUpdateUsesTheExistingInstallType(t *testing.T) {
	for _, tc := range []struct{ path, appImage, want string }{
		{"/usr/local/bin/markpad", "", "markpad"},
		{"/home/user/bin/markpad", "", "markpad"},
		{"/usr/bin/markpad", "", "markpad_0.13.5_amd64.deb"},
		{"/tmp/.mount/usr/bin/markpad", "/home/user/Quillpane.AppImage", "Markpad.AppImage"},
	} {
		if got := linuxUpdateAsset(tc.path, tc.appImage, "0.13.5"); got != tc.want {
			t.Fatalf("got %q want %q", got, tc.want)
		}
	}
}

func TestVerifiedUpdateRejectsCorruptAndTruncatedDownloads(t *testing.T) {
	payload := "verified installer"
	digest := fmt.Sprintf("sha256:%x", sha256.Sum256([]byte(payload)))
	for _, tc := range []struct {
		payload, digest string
		size            int64
		valid           bool
	}{
		{payload, digest, int64(len(payload)), true},
		{"tampered installer", digest, int64(len(payload)), false},
		{payload[:5], digest, int64(len(payload)), false},
		{payload + "extra", digest, int64(len(payload)), false},
		{payload, "sha256:invalid", int64(len(payload)), false},
		{payload, digest, 0, false},
		{payload, digest, 151 << 20, false},
	} {
		var destination bytes.Buffer
		err := copyVerifiedUpdate(&destination, strings.NewReader(tc.payload), tc.size, tc.digest)
		if (err == nil) != tc.valid {
			t.Fatalf("valid=%v, error=%v", tc.valid, err)
		}
	}
}

func TestInstallerPlatformRouting(t *testing.T) {
	for _, tc := range []struct{ platform, arch, want string }{
		{"windows", "amd64", "markpad-setup.exe"}, {"linux", "amd64", "markpad"},
		{"darwin", "arm64", "Markpad.dmg"}, {"linux", "arm64", ""}, {"windows", "arm64", ""},
	} {
		if got := installerAsset(tc.platform, tc.arch, "0.13.5"); got != tc.want {
			t.Fatalf("installer=%q want %q", got, tc.want)
		}
	}
}

func TestDecodeUpdate(t *testing.T) {
	for _, tc := range []struct {
		tag                string
		available, invalid bool
	}{
		{"v0.13.4", true, false}, {"v0.14.0", true, false}, {"v1.0.0", true, false},
		{"v0.13.3", false, false}, {"v0.9.9", false, false},
		{"v0.13.4-beta", false, true}, {"", false, true}, {"v-1.0.0", false, true},
	} {
		t.Run(tc.tag, func(t *testing.T) {
			result, err := decodeUpdate(strings.NewReader(`{"tag_name":"`+tc.tag+`"}`), "0.13.3")
			if (err != nil) != tc.invalid {
				t.Fatalf("error = %v", err)
			}
			if err == nil && (result.Available != tc.available || result.URL != releasesURL) {
				t.Fatalf("unexpected update: %+v", result)
			}
		})
	}
	for _, payload := range []string{`{`, `{"tag_name":"v1.0.0","draft":true}`, `{"tag_name":"v1.0.0","prerelease":true}`} {
		if _, err := decodeUpdate(strings.NewReader(payload), "0.13.3"); err == nil {
			t.Fatal("accepted invalid release")
		}
	}
}
