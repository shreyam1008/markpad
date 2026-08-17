// Package brand separates the product's public name from durable legacy
// identifiers that existing installations rely on.
package brand

import "strings"

const (
	// ProductName is the public display name used during the rebrand preview.
	ProductName = "Quillpane"
	// PreviewProductName remains fixed if ProductName is rolled back, so drafts
	// created while the preview was active are still recognized safely.
	PreviewProductName = "Quillpane"

	// LegacyProductName remains useful in migration copy and must not be reused
	// as a new package identity.
	LegacyProductName = "Markpad"

	// The values below are compatibility identifiers, not display copy. Changing
	// any of them requires a separately tested migration and installer plan.
	StorageName      = "markpad"
	BinaryName       = "markpad"
	SingleInstanceID = "c7b3e4a1-9f2d-4e8b-a6c1-markpad-single"

	// The repository and website stay at their legacy addresses until redirects
	// and ownership of the replacement addresses are verified.
	SourceURL  = "https://github.com/shreyam1008/markpad"
	WebsiteURL = "https://shreyam1008.github.io/markpad/"
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
