// Package brand separates Quillpane's public name from durable Markpad
// identifiers that existing installations rely on.
package brand

import "strings"

const (
	// ProductName is the approved public display name for the migration release.
	ProductName = "Quillpane"
	// PreviewProductName is retained as a compatibility alias for drafts created
	// during the earlier reversible preview.
	PreviewProductName = "Quillpane"

	// LegacyProductName remains the compatibility name used by existing builds.
	LegacyProductName = "Markpad"

	// The values below are compatibility identifiers, not display copy. Changing
	// any of them requires a separately tested migration and installer plan.
	StorageName      = "markpad"
	BinaryName       = "markpad"
	SingleInstanceID = "c7b3e4a1-9f2d-4e8b-a6c1-markpad-single"

	// The repository remains at its legacy address; the verified custom domain
	// is now canonical while the old Pages URL remains a compatibility redirect.
	SourceURL       = "https://github.com/shreyam1008/markpad"
	WebsiteURL      = "https://quillpane.shreyam1008.com.np/"
	LegacyWebsiteURL = "https://shreyam1008.github.io/markpad/"
)

// WindowTitle keeps document titles consistent without spreading the display
// name across filesystem and session code.
func WindowTitle(documentTitle string) string {
	documentTitle = strings.TrimSpace(documentTitle)
	if documentTitle == "" {
		return ProductName
	}
	return ProductName + " - " + documentTitle
}
