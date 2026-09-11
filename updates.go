package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const releasesURL = "https://github.com/shreyam1008/markpad/releases/latest"

type UpdateInfo struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	Available bool   `json:"available"`
	URL       string `json:"url"`
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
	return UpdateInfo{Current: current, Latest: strings.TrimPrefix(release.Tag, "v"), Available: available, URL: releasesURL}, nil
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
	return decodeUpdate(response.Body, Version)
}
