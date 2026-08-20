package brand

import "testing"

func TestCompatibilityIdentifiersRemainLegacyValues(t *testing.T) {
	t.Parallel()

	if PreviewProductName != "Quillpane" {
		t.Fatalf("preview product name changed: %q", PreviewProductName)
	}
	if StorageName != "markpad" {
		t.Fatalf("storage name = %q; changing it would orphan existing sessions", StorageName)
	}
	if BinaryName != "markpad" {
		t.Fatalf("binary name = %q; changing it would break existing CLI installs", BinaryName)
	}
	if SingleInstanceID != "c7b3e4a1-9f2d-4e8b-a6c1-markpad-single" {
		t.Fatalf("single-instance ID = %q; changing it would allow duplicate app instances", SingleInstanceID)
	}
}

func TestWindowTitleUsesPublicProductName(t *testing.T) {
	t.Parallel()

	if got := WindowTitle(""); got != ProductName {
		t.Fatalf("empty title = %q, want %q", got, ProductName)
	}
	if got := WindowTitle("notes.md"); got != "Markpad - notes.md" {
		t.Fatalf("document title = %q", got)
	}
}
