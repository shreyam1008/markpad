package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalCanvasFileNameUsesNativeMarkcanvasExtension(t *testing.T) {
	cases := []struct {
		title string
		want  string
	}{
		{title: "Roadmap", want: "Roadmap.markcanvas.json"},
		{title: "Roadmap.canvas", want: "Roadmap.markcanvas.json"},
		{title: "Roadmap.json", want: "Roadmap.markcanvas.json"},
		{title: "Roadmap.markcanvas.json", want: "Roadmap.markcanvas.json"},
	}

	for _, tc := range cases {
		t.Run(tc.title, func(t *testing.T) {
			if got := localCanvasFileName(tc.title); got != tc.want {
				t.Fatalf("localCanvasFileName(%q) = %q, want %q", tc.title, got, tc.want)
			}
		})
	}
}

func TestLocalOtherFileNameUsesValidatedTextExtension(t *testing.T) {
	cases := []struct {
		title string
		ext   string
		want  string
	}{
		{title: "Data", ext: "json", want: "Data.json"},
		{title: "Data.csv", ext: "txt", want: "Data.txt"},
		{title: "", ext: ".md", want: "Untitled.md"},
	}

	for _, tc := range cases {
		got, err := localOtherFileName(tc.title, tc.ext)
		if err != nil {
			t.Fatalf("localOtherFileName(%q, %q) error = %v", tc.title, tc.ext, err)
		}
		if got != tc.want {
			t.Fatalf("localOtherFileName(%q, %q) = %q, want %q", tc.title, tc.ext, got, tc.want)
		}
	}

	if _, err := localOtherFileName("Run me", "exe"); err == nil {
		t.Fatal("localOtherFileName accepted executable extension")
	}
	if _, err := localOtherFileName("Bad", "../sh"); err == nil {
		t.Fatal("localOtherFileName accepted unsafe extension characters")
	}
}

func TestLocalOtherFileTemplateUsesLightweightTextStarters(t *testing.T) {
	if got := localOtherFileTemplate("Data.json"); got != "{\n}\n" {
		t.Fatalf("JSON template = %q, want empty object", got)
	}
	if got := localOtherFileTemplate("Notes.md"); got != "# Notes\n\n" {
		t.Fatalf("Markdown template = %q, want heading", got)
	}
	if got := localOtherFileTemplate("Plain.txt"); got != "" {
		t.Fatalf("Text template = %q, want empty file", got)
	}
}

func TestMarkpadCanvasDocumentJSONIncludesNativeSchema(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal([]byte(markpadCanvasDocumentJSON("markpad-test")), &doc); err != nil {
		t.Fatalf("native canvas document is not valid JSON: %v", err)
	}
	if doc["type"] != "markpad-canvas" {
		t.Fatalf("type = %v, want markpad-canvas", doc["type"])
	}
	if doc["schema"] != "https://markpad.local/schemas/canvas-v1.json" {
		t.Fatalf("schema = %v, want canvas v1 schema", doc["schema"])
	}
	if doc["source"] != "markpad-test" {
		t.Fatalf("source = %v, want markpad-test", doc["source"])
	}
}

func TestCreateLocalFolderCanvasDocumentWritesProvidedDocument(t *testing.T) {
	root := t.TempDir()
	content := markpadCanvasDocumentJSON("scratch-save")

	if _, err := createLocalFolderCanvasDocumentFile(root, "Scratch Board", content); err != nil {
		t.Fatalf("createLocalFolderCanvasDocumentFile error = %v", err)
	}

	path := filepath.Join(root, "Scratch Board.markcanvas.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved canvas: %v", err)
	}
	if string(data) != content {
		t.Fatalf("saved canvas content = %q, want provided content", string(data))
	}
}

func TestCreateLocalFolderCanvasDocumentRejectsInvalidDocument(t *testing.T) {
	root := t.TempDir()

	if _, err := createLocalFolderCanvasDocumentFile(root, "Bad", `{"type":"not-markpad"}`); err == nil {
		t.Fatal("createLocalFolderCanvasDocumentFile accepted non-markpad canvas JSON")
	}
	if _, err := createLocalFolderCanvasDocumentFile(root, "Bad", `{`); err == nil {
		t.Fatal("createLocalFolderCanvasDocumentFile accepted invalid JSON")
	}
}

func TestLocalFolderAtomicWriteReplacesInPlaceWithoutTempResidue(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "Board.markcanvas.json")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatalf("seed canvas file: %v", err)
	}

	if err := localFolderAtomicWrite(path, []byte("new"), 0o644); err != nil {
		t.Fatalf("atomic write canvas file: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read replaced canvas file: %v", err)
	}
	if string(data) != "new" {
		t.Fatalf("canvas file content = %q, want new", string(data))
	}
	matches, err := filepath.Glob(path + ".tmp.*")
	if err != nil {
		t.Fatalf("glob temp files: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("left temp files after atomic write: %v", matches)
	}
}

func TestLocalOverviewCountsNativeMarkcanvasFilesAsCanvas(t *testing.T) {
	var overview LocalFolderOverview
	localOverviewClassify(filepath.Join("drawings", "Board.markcanvas.json"), 12, &overview)
	localOverviewClassify(filepath.Join("drawings", "data.json"), 12, &overview)

	if overview.Canvases != 1 {
		t.Fatalf("canvases = %d, want 1", overview.Canvases)
	}
	if overview.OtherText != 1 {
		t.Fatalf("other text = %d, want 1", overview.OtherText)
	}
}

func TestLocalFolderFileKindTreatsNativeMarkcanvasAsCanvas(t *testing.T) {
	if got := localFolderFileKind(filepath.Join("drawings", "Board.markcanvas.json")); got != "canvas" {
		t.Fatalf("localFolderFileKind(.markcanvas.json) = %q, want canvas", got)
	}
	if got := localFolderFileKind(filepath.Join("drawings", "data.json")); got == "canvas" {
		t.Fatalf("localFolderFileKind(.json) = %q, want non-canvas", got)
	}
}

func TestLocalGraphCanvasUsesNativeSchema(t *testing.T) {
	doc := localGraphBuildCanvas(map[string]*localGraphNode{}, nil)
	if doc.Type != "markpad-canvas" {
		t.Fatalf("type = %q, want markpad-canvas", doc.Type)
	}
	if doc.Schema != "https://markpad.local/schemas/canvas-v1.json" {
		t.Fatalf("schema = %q, want canvas v1 schema", doc.Schema)
	}
	if doc.Meta == nil {
		t.Fatal("meta = nil, want native format metadata")
	}
	if doc.Meta.Format != "markpad-canvas-v1" {
		t.Fatalf("meta.format = %q, want markpad-canvas-v1", doc.Meta.Format)
	}
	if doc.Meta.Generator != "markpad-local-links" {
		t.Fatalf("meta.generator = %q, want markpad-local-links", doc.Meta.Generator)
	}
}

func TestLocalGraphCanvasJSONCarriesNativeMeta(t *testing.T) {
	doc := localGraphBuildCanvas(map[string]*localGraphNode{}, nil)

	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("marshal local graph canvas: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode local graph canvas: %v", err)
	}

	meta, ok := decoded["meta"].(map[string]any)
	if !ok {
		t.Fatal("encoded canvas missing meta object")
	}
	if meta["format"] != "markpad-canvas-v1" {
		t.Fatalf("encoded meta.format = %v, want markpad-canvas-v1", meta["format"])
	}
	if meta["generator"] != "markpad-local-links" {
		t.Fatalf("encoded meta.generator = %v, want markpad-local-links", meta["generator"])
	}
}
