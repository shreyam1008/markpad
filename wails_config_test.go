package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestWailsConfigIsParseableWithCoreFields(t *testing.T) {
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}

	var config map[string]any
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("wails.json is not valid JSON: %v", err)
	}

	for _, key := range []string{
		"version",
		"name",
		"outputfilename",
		"build:dir",
		"frontend:dir",
		"assetdir",
		"wailsjsdir",
	} {
		value, ok := config[key].(string)
		if !ok || strings.TrimSpace(value) == "" {
			t.Fatalf("wails.json %q = %#v, want non-empty string", key, config[key])
		}
	}
	if config["version"] != "2" {
		t.Fatalf("wails.json version = %q, want %q", config["version"], "2")
	}
}
