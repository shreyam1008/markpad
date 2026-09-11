package main

import (
	"strings"
	"testing"
)

func TestDecodeUpdate(t *testing.T) {
	for _, tc := range []struct {
		tag                string
		available, invalid bool
	}{
		{"v0.13.4", true, false}, {"v0.14.0", true, false}, {"v1.0.0", true, false},
		{"v0.13.3", false, false}, {"v0.9.9", false, false},
		{"v0.13.4-beta", false, true}, {"", false, true}, {"v-1.0.0", false, true},
	} {
		t.Run(tc.tag, func(t *testing.T) {
			result, err := decodeUpdate(strings.NewReader(`{"tag_name":"`+tc.tag+`"}`), "0.13.3")
			if (err != nil) != tc.invalid {
				t.Fatalf("error = %v", err)
			}
			if err == nil && (result.Available != tc.available || result.URL != releasesURL) {
				t.Fatalf("unexpected update: %+v", result)
			}
		})
	}
	for _, payload := range []string{`{`, `{"tag_name":"v1.0.0","draft":true}`, `{"tag_name":"v1.0.0","prerelease":true}`} {
		if _, err := decodeUpdate(strings.NewReader(payload), "0.13.3"); err == nil {
			t.Fatal("accepted invalid release")
		}
	}
}
