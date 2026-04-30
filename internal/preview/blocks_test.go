package preview

import "testing"

func TestParseCommonMarkdownBlocks(t *testing.T) {
	blocks := Parse("# Title\n\nA paragraph\ncontinues.\n\n- one\n1. two\n> quoted\n\n```\ncode\n```\n---")
	if len(blocks) != 7 {
		t.Fatalf("got %d blocks", len(blocks))
	}
	if blocks[0].Kind != Heading || blocks[0].Level != 1 || blocks[0].Text != "Title" {
		t.Fatalf("heading = %#v", blocks[0])
	}
	if blocks[1].Kind != Paragraph || blocks[1].Text != "A paragraph continues." {
		t.Fatalf("paragraph = %#v", blocks[1])
	}
	if blocks[2].Kind != Bullet || blocks[3].Kind != Ordered || blocks[4].Kind != Quote {
		t.Fatalf("list/quote blocks = %#v", blocks[2:5])
	}
	if blocks[5].Kind != Code || blocks[5].Text != "code" {
		t.Fatalf("code = %#v", blocks[5])
	}
	if blocks[6].Kind != Rule {
		t.Fatalf("rule = %#v", blocks[6])
	}
}
