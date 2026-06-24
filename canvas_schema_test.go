package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

var canvasSessionAndCacheKeys = []string{
	"camera",
	"selection",
	"tool",
	"grid",
	"snap",
	"minimap",
	"undo",
	"history",
	"cachedBounds",
	"rasterPreview",
	"spatialIndex",
}

func TestCanvasSchemaRejectsSessionAndCacheState(t *testing.T) {
	data, err := os.ReadFile("docs/markpad-canvas-v1.schema.json")
	if err != nil {
		t.Fatalf("read canvas schema: %v", err)
	}

	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatalf("canvas schema must be valid JSON: %v", err)
	}

	assertCanvasSchemaForbidsKeys(t, "top-level document", schema)

	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing properties object")
	}
	appState, ok := properties["appState"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing appState object")
	}
	assertCanvasSchemaForbidsKeys(t, "appState", appState)
}

func TestCanvasSchemaDefinesNativeAndInterchangeGuardrails(t *testing.T) {
	data, err := os.ReadFile("docs/markpad-canvas-v1.schema.json")
	if err != nil {
		t.Fatalf("read canvas schema: %v", err)
	}

	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatalf("canvas schema must be valid JSON: %v", err)
	}

	if schema["$id"] != "https://markpad.local/schemas/canvas-v1.json" {
		t.Fatalf("schema $id = %v, want native markpad canvas schema id", schema["$id"])
	}
	if schema["x-markpad-nativeExtension"] != ".markcanvas.json" {
		t.Fatalf("native extension = %v, want .markcanvas.json", schema["x-markpad-nativeExtension"])
	}
	interopExts, ok := schema["x-markpad-interchangeExtensions"].([]any)
	if !ok || len(interopExts) != 1 || interopExts[0] != ".canvas" {
		t.Fatalf("interchange extensions = %v, want [.canvas]", schema["x-markpad-interchangeExtensions"])
	}
	description, _ := schema["description"].(string)
	for _, want := range []string{".markcanvas.json", "JSON Canvas", "Obsidian", "import/export adapters"} {
		if !strings.Contains(description, want) {
			t.Fatalf("canvas schema description should mention %q", want)
		}
	}

	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing properties object")
	}
	typeSchema, ok := properties["type"].(map[string]any)
	if !ok || typeSchema["const"] != "markpad-canvas" {
		t.Fatalf("type const = %v, want markpad-canvas", typeSchema["const"])
	}
	meta, ok := properties["meta"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing meta object")
	}
	metaProperties, ok := meta["properties"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing meta properties object")
	}
	format, ok := metaProperties["format"].(map[string]any)
	if !ok || format["const"] != "markpad-canvas-v1" {
		t.Fatalf("meta.format const = %v, want markpad-canvas-v1", format["const"])
	}
	importedFrom, ok := metaProperties["importedFrom"].(map[string]any)
	if !ok {
		t.Fatal("canvas schema missing meta.importedFrom")
	}
	importedFromDescription, _ := importedFrom["description"].(string)
	for _, want := range []string{"JSON Canvas", "Obsidian", ".canvas"} {
		if !strings.Contains(importedFromDescription, want) {
			t.Fatalf("meta.importedFrom description should mention %q", want)
		}
	}
}

func TestCanvasDecisionDocsKeepSessionStateOutOfDocument(t *testing.T) {
	data, err := os.ReadFile("docs/local-first-feature-decisions.md")
	if err != nil {
		t.Fatalf("read canvas decision doc: %v", err)
	}
	text := string(data)

	if strings.Contains(text, "viewport/session metadata") {
		t.Fatal("canvas decision doc must not describe viewport/session metadata as portable document state")
	}
	for _, key := range canvasSessionAndCacheKeys {
		if !strings.Contains(text, key) {
			t.Fatalf("canvas decision doc should explicitly keep %q out of portable documents", key)
		}
	}
}

func TestCanvasDecisionDocsDefineNativeInteropBoundary(t *testing.T) {
	data, err := os.ReadFile("docs/local-first-feature-decisions.md")
	if err != nil {
		t.Fatalf("read canvas decision doc: %v", err)
	}
	text := string(data)

	for _, want := range []string{".markcanvas.json", ".canvas", "JSON Canvas", "Obsidian", "lossy", "meta.importedFrom"} {
		if !strings.Contains(text, want) {
			t.Fatalf("canvas decision doc should mention %q", want)
		}
	}
}

func assertCanvasSchemaForbidsKeys(t *testing.T, label string, schema map[string]any) {
	t.Helper()
	forbidden := canvasSchemaForbiddenRequiredKeys(schema)
	for _, key := range canvasSessionAndCacheKeys {
		if !forbidden[key] {
			t.Fatalf("%s schema does not forbid session/cache key %q", label, key)
		}
	}
}

func canvasSchemaForbiddenRequiredKeys(schema map[string]any) map[string]bool {
	forbidden := map[string]bool{}

	notClause, ok := schema["not"].(map[string]any)
	if !ok {
		return forbidden
	}
	anyOf, ok := notClause["anyOf"].([]any)
	if !ok {
		return forbidden
	}
	for _, item := range anyOf {
		obj, ok := item.(map[string]any)
		if !ok {
			continue
		}
		required, ok := obj["required"].([]any)
		if !ok || len(required) != 1 {
			continue
		}
		key, ok := required[0].(string)
		if ok {
			forbidden[key] = true
		}
	}
	return forbidden
}
