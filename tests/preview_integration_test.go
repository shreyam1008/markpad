package tests

import (
	"strings"
	"testing"

	"markpad/internal/markdown"
	"markpad/internal/preview"
)

func TestPreviewKeepsLargeDocumentBlockOrder(t *testing.T) {
	var b strings.Builder
	b.WriteString("# Large\n\n")
	for i := 0; i < 1500; i++ {
		b.WriteString("- item\n")
	}
	b.WriteString("\n```\ncode\n```\n")

	blocks := preview.Parse(b.String())
	if len(blocks) != 1502 {
		t.Fatalf("blocks = %d, want 1502", len(blocks))
	}
	if blocks[0].Kind != preview.Heading {
		t.Fatalf("first block = %#v", blocks[0])
	}
	if blocks[len(blocks)-1].Kind != preview.Code {
		t.Fatalf("last block = %#v", blocks[len(blocks)-1])
	}
}

func TestMarkdownHTMLSupportsPlainTextAndGFM(t *testing.T) {
	html, err := markdown.RenderHTML("plain text\n\n- [x] task\n\n| A | B |\n| - | - |\n| 1 | 2 |")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"plain text", "checkbox", "<table>"} {
		if !strings.Contains(html, want) {
			t.Fatalf("html missing %q: %s", want, html)
		}
	}
}

func BenchmarkPreviewParseLargeMarkdown(b *testing.B) {
	var source strings.Builder
	source.WriteString("# Bench\n\n")
	for i := 0; i < 10000; i++ {
		source.WriteString("Paragraph text with **markdown** and a [link](https://example.com).\n\n")
	}
	value := source.String()
	b.ReportAllocs()
	b.SetBytes(int64(len(value)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = preview.Parse(value)
	}
}
