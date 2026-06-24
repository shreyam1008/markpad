package main

import (
	"io/fs"
	"strings"
	"testing"
)

func TestEmbeddedFrontendAssetsExposeIndexAtRoot(t *testing.T) {
	frontendAssets, err := fs.Sub(assets, "frontend")
	if err != nil {
		t.Fatal(err)
	}
	data, err := fs.ReadFile(frontendAssets, "index.html")
	if err != nil {
		t.Fatalf("embedded frontend root is missing index.html: %v", err)
	}
	if !strings.Contains(string(data), "src/main.js") {
		t.Fatalf("embedded index.html does not reference the Markpad frontend script")
	}
	if strings.Contains(string(data), "https://cdnjs.cloudflare.com") {
		t.Fatalf("embedded index.html must not block first paint on CDN assets")
	}
}
