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
