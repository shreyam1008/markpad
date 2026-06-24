package main

import (
	"encoding/json"
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
}
