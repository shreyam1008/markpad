package httpserver

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/ZenNotes/zennotes/apps/server/internal/config"
)

func TestListNotesPageEndpoint(t *testing.T) {
	root := t.TempDir()
	inbox := filepath.Join(root, "inbox")
	if err := os.MkdirAll(inbox, 0o700); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{
		"Alpha.md":   "# Alpha\n",
		"Bravo.md":   "# Bravo\n",
		"Charlie.md": "# Charlie\n",
	} {
		if err := os.WriteFile(filepath.Join(inbox, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	server, _ := newTestServer(t, config.Config{
		VaultPath:        root,
		DefaultVaultPath: root,
		Bind:             "127.0.0.1:7878",
	})

	body, _ := json.Marshal(map[string]any{
		"offset": 1,
		"limit":  1,
		"filter": map[string]any{
			"folder": "inbox",
		},
		"sort": "name-asc",
	})
	resp, err := http.Post(server.URL+"/api/notes/page", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/notes/page: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("page status: %d", resp.StatusCode)
	}
	var page struct {
		Notes []struct {
			Title string `json:"title"`
		} `json:"notes"`
		NextOffset int  `json:"nextOffset"`
		Done       bool `json:"done"`
		Total      int  `json:"total"`
		HasMore    bool `json:"hasMore"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		t.Fatalf("decode page response: %v", err)
	}
	if page.Total != 3 || page.NextOffset != 2 || page.Done || !page.HasMore {
		t.Fatalf("unexpected page metadata: %#v", page)
	}
	if len(page.Notes) != 1 || page.Notes[0].Title != "Bravo" {
		t.Fatalf("unexpected notes: %#v", page.Notes)
	}
}
