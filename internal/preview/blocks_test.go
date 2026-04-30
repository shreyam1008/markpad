package preview

import "testing"

func TestParseCommonMarkdownBlocks(t *testing.T) {
	blocks := Parse("# Title\n\nA paragraph\ncontinues.\n\n- one\n- [x] task\n1. two\n> quoted\n\n```\ncode\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n---")
	if len(blocks) != 9 {
		t.Fatalf("got %d blocks", len(blocks))
	}
	if blocks[0].Kind != Heading || blocks[0].Level != 1 || blocks[0].Text != "Title" {
		t.Fatalf("heading = %#v", blocks[0])
	}
	if blocks[1].Kind != Paragraph || blocks[1].Text != "A paragraph continues." {
		t.Fatalf("paragraph = %#v", blocks[1])
	}
	if blocks[2].Kind != Bullet || blocks[3].Kind != Task || !blocks[3].Checked || blocks[4].Kind != Ordered || blocks[5].Kind != Quote {
		t.Fatalf("list/quote blocks = %#v", blocks[2:6])
	}
	if blocks[6].Kind != Code || blocks[6].Text != "code" {
		t.Fatalf("code = %#v", blocks[6])
	}
	if blocks[7].Kind != Table || blocks[7].Text == "" {
		t.Fatalf("table = %#v", blocks[7])
	}
	if blocks[8].Kind != Rule {
		t.Fatalf("rule = %#v", blocks[8])
	}
}
