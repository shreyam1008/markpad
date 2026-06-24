package main

import (
	"io/fs"
	"os"
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

func TestFrontendRuntimeAvoidsRemoteCDNLoaders(t *testing.T) {
	for _, path := range []string{"frontend/index.html", "frontend/src/main.js"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		text := string(data)
		for _, forbidden := range []string{
			"cdn.tailwindcss.com",
			"cdnjs.cloudflare.com",
			"fonts.googleapis.com",
			"fonts.gstatic.com",
		} {
			if strings.Contains(text, forbidden) {
				t.Fatalf("%s must not load remote CDN resource %q", path, forbidden)
			}
		}
	}
}

func TestDocsPageAvoidsCDNFirstPaintDependencies(t *testing.T) {
	data, err := os.ReadFile("docs/index.html")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{
		"cdn.tailwindcss.com",
		"fonts.googleapis.com",
		"fonts.gstatic.com",
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("docs/index.html must not depend on %q for first paint", forbidden)
		}
	}
}
