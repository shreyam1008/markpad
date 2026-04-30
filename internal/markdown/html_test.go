package markdown

import (
	"strings"
	"testing"
)

func TestRenderHTMLUsesGFM(t *testing.T) {
	html, err := RenderHTML("# Title\n\n- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"<h1", "<table>", "checkbox"} {
		if !strings.Contains(html, want) {
			t.Fatalf("html missing %q: %s", want, html)
		}
	}
}
