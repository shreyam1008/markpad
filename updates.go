package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const releasesURL = "https://github.com/shreyam1008/markpad/releases/latest"

type UpdateInfo struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Available bool   `json:"available"`
	URL       string `json:"url"`
	Asset     string `json:"asset"`
	Digest    string `json:"digest"`
	Size      int64  `json:"size"`
	Managed   string `json:"managed"`
}

func releaseVersion(value string) ([3]int, error) {
	var version [3]int
	parts := strings.Split(strings.TrimPrefix(value, "v"), ".")
	if len(parts) != 3 {
		return version, fmt.Errorf("unsupported release version")
	}
	for i, part := range parts {
		if part == "" || strings.Trim(part, "0123456789") != "" {
			return version, fmt.Errorf("invalid release version")
		}
		n, err := strconv.Atoi(part)
		if err != nil {
			return version, fmt.Errorf("invalid release version")
		}
		version[i] = n
	}
	return version, nil
}

func decodeUpdate(reader io.Reader, current string) (UpdateInfo, error) {
	var release struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name   string `json:"name"`
			Digest string `json:"digest"`
			Size   int64  `json:"size"`
		} `json:"assets"`
	}
	if err := json.NewDecoder(io.LimitReader(reader, 1<<20)).Decode(&release); err != nil {
		return UpdateInfo{}, fmt.Errorf("could not read release information")
	}
	latest, err := releaseVersion(release.Tag)
	if err != nil || release.Draft || release.Prerelease {
		return UpdateInfo{}, fmt.Errorf("no stable release information available")
	}
	installed, err := releaseVersion(current)
	if err != nil {
		return UpdateInfo{}, err
	}
	available := false
	for i := range latest {
		if latest[i] != installed[i] {
			available = latest[i] > installed[i]
			break
		}
	}
	info := UpdateInfo{Current: current, Latest: strings.TrimPrefix(release.Tag, "v"), Available: available, URL: releasesURL}
	name := installerAsset(runtime.GOOS, runtime.GOARCH, info.Latest)
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		executable, _ := os.Executable()
		name = linuxUpdateAsset(executable, os.Getenv("APPIMAGE"), info.Latest)
	}
	for _, asset := range release.Assets {
		if asset.Name == name {
			info.Asset = name
			info.Digest = asset.Digest
			info.Size = asset.Size
			break
		}
	}
	return info, nil
}

func installerAsset(platform, arch, version string) string {
	if platform == "darwin" {
		return "Markpad.dmg"
	}
	if arch != "amd64" {
		return ""
	}
	if platform == "windows" {
		return "markpad-setup.exe"
	}
	if platform == "linux" {
		return "markpad"
	}
	return ""
}

func linuxUpdateAsset(executable, appImage, version string) string {
	if appImage != "" {
		return "Markpad.AppImage"
	}
	if executable == "/usr/bin/markpad" {
		return "markpad_" + version + "_amd64.deb"
	}
	return "markpad"
}

func installLinuxUpdate(ctx context.Context, source, asset string) error {
	if strings.HasSuffix(asset, ".deb") {
		output, err := exec.CommandContext(ctx, "pkexec", "dpkg", "--install", source).CombinedOutput()
		if err != nil {
			return fmt.Errorf("system package update failed: %s (%w)", strings.TrimSpace(string(output)), err)
		}
		return nil
	}
	destination, err := os.Executable()
	if err != nil {
		return err
	}
	if asset == "Markpad.AppImage" {
		destination = os.Getenv("APPIMAGE")
	}
	err = replacePortableUpdate(source, destination)
	if os.IsPermission(err) {
		output, installErr := exec.CommandContext(ctx, "pkexec", "install", "-m", "755", source, destination).CombinedOutput()
		if installErr != nil {
			return fmt.Errorf("update authorization or installation failed: %s (%w)", strings.TrimSpace(string(output)), installErr)
		}
		return nil
	}
	return err
}

func replacePortableUpdate(source, destination string) error {
	if !filepath.IsAbs(destination) {
		return fmt.Errorf("could not identify the installed application")
	}
	info, err := os.Lstat(destination)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("installed application path is not a regular file")
	}
	// Replace in the same directory so the running process keeps its old inode
	// while the next launch uses the new version. Never install a second PATH copy.
	staged, err := os.CreateTemp(filepath.Dir(destination), ".quillpane-update-*")
	if err != nil {
		return err
	}
	defer os.Remove(staged.Name())
	input, err := os.Open(source)
	if err != nil {
		staged.Close()
		return err
	}
	_, err = io.Copy(staged, input)
	input.Close()
	if err == nil {
		err = staged.Chmod(info.Mode().Perm())
	}
	if err == nil {
		err = staged.Sync()
	}
	closeErr := staged.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(staged.Name(), destination)
}

func managedUpdateChannel() string {
	if os.Getenv("SNAP") != "" {
		return "snap"
	}
	path, _ := os.Executable()
	if runtime.GOOS == "windows" && strings.Contains(strings.ToLower(path), "\\windowsapps\\") {
		return "microsoft-store"
	}
	if os.Getenv("FLATPAK_ID") != "" {
		return "flatpak"
	}
	return ""
}

// CheckForUpdates is explicitly requested from Help; no document data is sent.
func (a *App) CheckForUpdates() (UpdateInfo, error) {
	ctx, cancel := context.WithTimeout(a.ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/repos/shreyam1008/markpad/releases/latest", nil)
	if err != nil {
		return UpdateInfo{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Quillpane/"+Version)
	client := &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(req)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("could not check for updates; check your connection and try again")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return UpdateInfo{}, fmt.Errorf("release service unavailable (%d); try again later", response.StatusCode)
	}
	info, err := decodeUpdate(response.Body, Version)
	info.Managed = managedUpdateChannel()
	return info, err
}

type updateProgress struct {
	Phase   string `json:"phase"`
	Percent int    `json:"percent"`
}

type downloadProgress struct {
	total, received int64
	last            time.Time
	report          func(int)
}

func (p *downloadProgress) Write(data []byte) (int, error) {
	p.received += int64(len(data))
	if time.Since(p.last) > 250*time.Millisecond {
		p.last = time.Now()
		p.report(int(min(p.received*100/p.total, 100)))
	}
	return len(data), nil
}

func copyVerifiedUpdate(destination io.Writer, source io.Reader, size int64, digest string) error {
	if size <= 0 || size > 150<<20 || !strings.HasPrefix(digest, "sha256:") {
		return fmt.Errorf("release has no valid verification metadata")
	}
	expected, err := hex.DecodeString(strings.TrimPrefix(digest, "sha256:"))
	if err != nil || len(expected) != sha256.Size {
		return fmt.Errorf("release checksum is invalid")
	}
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(destination, hash), io.LimitReader(source, size+1))
	if err != nil {
		return err
	}
	if n != size || hex.EncodeToString(hash.Sum(nil)) != hex.EncodeToString(expected) {
		return fmt.Errorf("download verification failed; the installer was not opened")
	}
	return nil
}

// DownloadAndOpenUpdate hands a verified package to the OS installer. It never
// quits the editor or bypasses OS authorization and Store-managed installations.
func (a *App) DownloadAndOpenUpdate() (string, error) {
	if !a.updateMu.TryLock() {
		return "", fmt.Errorf("an update is already in progress")
	}
	defer a.updateMu.Unlock()
	if managedUpdateChannel() != "" {
		return "", fmt.Errorf("this installation must be updated through its store")
	}
	info, err := a.CheckForUpdates()
	if err != nil {
		return "", err
	}
	if !info.Available {
		return "Already up to date", nil
	}
	if info.Asset == "" || info.Size <= 0 || info.Size > 150<<20 || len(info.Digest) != 71 {
		return "", fmt.Errorf("no verified installer is available for this platform")
	}
	ctx, cancel := context.WithTimeout(a.ctx, 5*time.Minute)
	defer cancel()
	url := "https://github.com/shreyam1008/markpad/releases/download/v" + info.Latest + "/" + info.Asset
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Scheme != "https" || len(via) > 5 {
			return fmt.Errorf("unsafe download redirect")
		}
		return nil
	}}
	response, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download failed; check your connection and retry")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download service returned %d", response.StatusCode)
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cache, "quillpane", "updates", info.Latest)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	file, err := os.CreateTemp(dir, "download-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(file.Name())
	report := func(percent int) {
		wailsruntime.EventsEmit(a.ctx, "update:progress", updateProgress{"Downloading", percent})
	}
	report(0)
	progress := &downloadProgress{total: info.Size, report: report}
	err = copyVerifiedUpdate(file, io.TeeReader(response.Body, progress), info.Size, info.Digest)
	closeErr := file.Close()
	if err != nil {
		return "", err
	}
	if closeErr != nil {
		return "", closeErr
	}
	destination := filepath.Join(dir, info.Asset)
	// Existing verified downloads can be reused; avoid replacing a running installer.
	if _, err := os.Stat(destination); err == nil {
		existing, openErr := os.Open(destination)
		if openErr != nil {
			return "", openErr
		}
		verifyErr := copyVerifiedUpdate(io.Discard, existing, info.Size, info.Digest)
		existing.Close()
		if verifyErr != nil {
			return "", fmt.Errorf("cached installer is invalid; remove %s and retry", destination)
		}
	} else if err = os.Rename(file.Name(), destination); err != nil {
		return "", err
	}
	wailsruntime.EventsEmit(a.ctx, "update:progress", updateProgress{"Opening installer", 100})
	if runtime.GOOS == "linux" {
		wailsruntime.EventsEmit(a.ctx, "update:progress", updateProgress{"Installing update; authorize the system prompt if shown", 100})
		if err := installLinuxUpdate(ctx, destination, info.Asset); err != nil {
			return "", err
		}
		return "Update installed. Save your work and restart Quillpane to run version " + info.Latest + ".", nil
	}
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", destination)
	case "darwin":
		command = exec.Command("open", destination)
	default:
		command = exec.Command("xdg-open", destination)
	}
	if err = command.Start(); err != nil {
		return "", fmt.Errorf("installer saved at %s, but could not open: %w", destination, err)
	}
	go func() { _ = command.Wait() }()
	return "Verified installer opened. Save your work, close Quillpane, and complete the system installer. Reopen Quillpane afterward.", nil
}
