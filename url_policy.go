package main

import (
	"net/url"
	"strings"
)

// isAllowedExternalURL keeps web links separate from filesystem actions.
// Local paths must go through the explicit open-path methods instead.
func isAllowedExternalURL(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}

	u, err := url.ParseRequestURI(raw)
	if err != nil {
		return false
	}

	switch strings.ToLower(u.Scheme) {
	case "http", "https":
		return u.Host != ""
	case "mailto":
		return u.Opaque != "" || u.Path != ""
	default:
		return false
	}
}
