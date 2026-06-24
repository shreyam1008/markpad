package main

import (
	"io/fs"
	"os"
	"path/filepath"
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

const (
	frontendBundledAssetTotalMaxBytes = 128 * 1024
	frontendRasterAssetMaxBytes       = 48 * 1024
	frontendVectorAssetMaxBytes       = 16 * 1024
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

func TestFrontendAvoidsHeavyBundledAssets(t *testing.T) {
	var total int64
	walkFrontendAssetFiles(t, func(path string, info fs.FileInfo) {
		ext := strings.ToLower(filepath.Ext(path))
		total += info.Size()
		switch ext {
		case ".woff", ".woff2", ".ttf", ".otf", ".eot":
			t.Fatalf("%s is a bundled font asset; use CSS variables, text labels, or tiny inline SVG instead", path)
		case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico":
			if info.Size() > frontendRasterAssetMaxBytes {
				t.Fatalf("%s is %d bytes, max raster asset budget is %d bytes", path, info.Size(), frontendRasterAssetMaxBytes)
			}
		case ".svg":
			if info.Size() > frontendVectorAssetMaxBytes {
				t.Fatalf("%s is %d bytes, max SVG asset budget is %d bytes", path, info.Size(), frontendVectorAssetMaxBytes)
			}
		}
	})
	if total > frontendBundledAssetTotalMaxBytes {
		t.Fatalf("frontend bundled visual assets total %d bytes, max %d bytes", total, frontendBundledAssetTotalMaxBytes)
	}
}

func TestDraftTrashByteCapContractIsGuarded(t *testing.T) {
	data, err := os.ReadFile("frontend/src/main.js")
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)

	assertTextIncludesAll(t, "frontend/src/main.js", text, []string{
		"const DRAFT_TRASH_BYTES = 1536 * 1024;",
		"const retained = (Array.isArray(items) ? items : []).slice(0, 80);",
		"while (retained.length && byteSize(serialized) > DRAFT_TRASH_BYTES) {",
		"retained.pop();",
		"localStorage.setItem(DRAFT_TRASH_KEY, payload.serialized);",
		"draftCapBytes: DRAFT_TRASH_BYTES",
		"draftOverCap: trashBytes > DRAFT_TRASH_BYTES",
		"Newest 80 drafts stay first; oldest drafts are trimmed to fit the byte cap",
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

func walkFrontendAssetFiles(t *testing.T, check func(path string, info fs.FileInfo)) {
	t.Helper()

	rootFS := os.DirFS("frontend")
	if err := fs.WalkDir(rootFS, ".", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			switch entry.Name() {
			case ".vite", "build", "dist", "node_modules", "wailsjs":
				return fs.SkipDir
			default:
				return nil
			}
		}
		if !isBundledVisualAssetFile(path) {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		check("frontend/"+strings.TrimPrefix(path, "./"), info)
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

func isBundledVisualAssetFile(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".bmp", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".otf", ".png", ".svg", ".ttf", ".webp", ".woff", ".woff2":
		return true
	default:
		return false
	}
}
