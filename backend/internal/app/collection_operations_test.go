package app

import "testing"

func TestCollectionContentAllowsExpectedFileKinds(t *testing.T) {
	cases := []struct {
		contentType string
		mimeType    string
		want        bool
	}{
		{"mixed", "application/pdf", true},
		{"media", "image/jpeg", true},
		{"media", "video/mp4", true},
		{"media", "audio/mpeg", false},
		{"audio", "audio/ogg", true},
		{"audio", "image/webp", false},
		{"documents", "application/pdf", true},
		{"documents", "image/jpeg", false},
	}
	for _, tt := range cases {
		if got := collectionContentAllows(tt.contentType, tt.mimeType); got != tt.want {
			t.Errorf("collectionContentAllows(%q, %q) = %v, want %v", tt.contentType, tt.mimeType, got, tt.want)
		}
	}
}

func TestCollectionValidation(t *testing.T) {
	if !validCollectionKind("folder") || !validCollectionKind("album") || validCollectionKind("tree") {
		t.Fatal("unexpected collection display-kind validation")
	}
	if !validCollectionLevel("viewer") || !validCollectionLevel("editor") || validCollectionLevel("owner") {
		t.Fatal("unexpected collection access-level validation")
	}
}
