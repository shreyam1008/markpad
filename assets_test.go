package main

import (
	"io/fs"
	"os"
	"strings"
	"testing"
)

var remoteCDNAndFontHosts = []string{
	"ajax.googleapis.com",
	"cdn.jsdelivr.net",
	"cdn.tailwindcss.com",
	"cdnjs.cloudflare.com",
	"code.jquery.com",
	"esm.sh",
	"fonts.bunny.net",
	"fonts.googleapis.com",
	"fonts.gstatic.com",
	"ga.jspm.io",
	"jspm.dev",
	"kit.fontawesome.com",
	"p.typekit.net",
	"rsms.me",
	"skypack.dev",
	"unpkg.com",
	"use.fontawesome.com",
	"use.typekit.net",
}

var runtimePDFOrHighlightCDNClaims = []string{
	"cdn highlight.js",
	"cdn highlightjs",
	"cdn hljs",
	"cdn pdf.js",
	"cdn pdfjs",
	"cdn pdfjs-dist",
	"highlight.js cdn",
	"highlight.js from a cdn",
	"highlightjs cdn",
	"highlightjs from a cdn",
	"hljs cdn",
	"hljs from a cdn",
	"pdf.js cdn",
	"pdf.js from a cdn",
	"pdfjs cdn",
	"pdfjs from a cdn",
	"pdfjs-dist cdn",
	"pdfjs-dist from a cdn",
}

var hostedTaskVendorMarkers = []string{
	"api.linear.app",
	"api.notion.com",
	"api.todoist.com",
	"api.trello.com",
	"app.asana.com/api",
	"asana.com/api/1.0",
	"graph.microsoft.com/v1.0/me/todo",
	"linear.app/graphql",
	"notion.so/api",
	"todoist.com/oauth",
	"trello.com/1/",
}

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
	assertTextOmits(t, "embedded frontend/index.html", string(data), remoteCDNAndFontHosts)
}

func TestFrontendRuntimeAvoidsRemoteCDNLoaders(t *testing.T) {
	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, remoteCDNAndFontHosts)
	})
}

func TestFrontendDoesNotClaimRuntimePDFOrHighlightCDNs(t *testing.T) {
	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, runtimePDFOrHighlightCDNClaims)
	})
}

func TestDocsPageAvoidsCDNFirstPaintDependencies(t *testing.T) {
	data, err := os.ReadFile("docs/index.html")
	if err != nil {
		t.Fatal(err)
	}
	assertTextOmits(t, "docs/index.html", string(data), remoteCDNAndFontHosts)
}

func TestTaskSystemKeepsPortableMarkdownContract(t *testing.T) {
	data, err := os.ReadFile("docs/local-first-format-decisions.md")
	if err != nil {
		t.Fatal(err)
	}
	assertTextIncludesAll(t, "docs/local-first-format-decisions.md", string(data), []string{
		"Use a Markdown task file as the canonical format.",
		"Task line format: GitHub-style Markdown tasks",
		"No lock-in: users can edit the task file in any Markdown editor.",
		"must be disposable and rebuilt from `tasks.md`",
	})

	walkStaticTextFiles(t, "frontend", func(path, text string) {
		assertTextOmits(t, path, text, hostedTaskVendorMarkers)
	})
}

func assertTextOmits(t *testing.T, path string, text string, forbidden []string) {
	t.Helper()

	lowerText := strings.ToLower(text)
	for _, value := range forbidden {
		if strings.Contains(lowerText, strings.ToLower(value)) {
			t.Fatalf("%s must not reference %q", path, value)
		}
	}
}

func assertTextIncludesAll(t *testing.T, path string, text string, required []string) {
	t.Helper()

	for _, value := range required {
		if !strings.Contains(text, value) {
			t.Fatalf("%s must include %q", path, value)
		}
	}
}

func walkStaticTextFiles(t *testing.T, root string, check func(path, text string)) {
	t.Helper()

	rootFS := os.DirFS(root)
	if err := fs.WalkDir(rootFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".vite", "build", "dist", "node_modules":
				return fs.SkipDir
			default:
				return nil
			}
		}
		if !isStaticTextFile(path) {
			return nil
		}
		data, err := fs.ReadFile(rootFS, path)
		if err != nil {
			return err
		}
		check(root+"/"+strings.TrimPrefix(path, "./"), string(data))
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func isStaticTextFile(path string) bool {
	for _, suffix := range []string{
		".css",
		".html",
		".js",
		".jsx",
		".mjs",
		".svelte",
		".ts",
		".tsx",
		".vue",
	} {
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}
