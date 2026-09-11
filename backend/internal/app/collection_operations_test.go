package app

import "testing"

func TestCollectionContentAllowsExpectedFileKinds(t *testing.T) {
	cases := []struct {
		contentType  string
		customTypes  string
		mimeType     string
		originalName string
		want         bool
	}{
		{"mixed", "", "application/pdf", "guide.pdf", true},
		{"media", "", "image/jpeg", "cover.jpg", true},
		{"media", "", "video/mp4", "movie.mp4", true},
		{"media", "", "audio/mpeg", "song.mp3", false},
		{"audio", "", "audio/ogg", "recording.ogg", true},
		{"audio", "", "image/webp", "photo.webp", false},
		{"documents", "", "application/pdf", "guide.pdf", true},
		{"documents", "", "image/jpeg", "photo.jpg", false},
		{"custom", "*.png, *.pdf", "image/png", "cover.png", true},
		{"custom", "*.png, *.pdf", "image/jpeg", "cover.jpg", false},
	}
	for _, tt := range cases {
		if got := collectionContentAllows(tt.contentType, tt.customTypes, tt.mimeType, tt.originalName); got != tt.want {
			t.Errorf("collectionContentAllows(%q, %q) = %v, want %v", tt.contentType, tt.mimeType, got, tt.want)
		}
	}
}

func TestCollectionValidation(t *testing.T) {
	if !validCollectionKind("folder") || !validCollectionKind("album") || !validCollectionKind("music-album") || validCollectionKind("tree") {
		t.Fatal("unexpected collection display-kind validation")
	}
	if !validCollectionLevel("viewer") || !validCollectionLevel("editor") || validCollectionLevel("owner") {
		t.Fatal("unexpected collection access-level validation")
	}
	if normalized, valid := normalizeCustomFileTypes(" *.PNG, *.pdf "); !valid || normalized != "*.png, *.pdf" {
		t.Fatalf("custom file patterns were not normalized: %q, %v", normalized, valid)
	}
	if _, valid := normalizeCustomFileTypes("*.png, *.bad!"); valid {
		t.Fatal("invalid custom file pattern was accepted")
	}
}

func TestDeriveMessagePreview(t *testing.T) {
	cases := []struct {
		content         *string
		messageType     string
		attachmentCount int
		want            string
	}{
		{nil, "collection", 0, "Folder"},
		{nil, "file", 1, "File"},
		{nil, "image", 1, "Photo"},
		{nil, "video", 1, "Video"},
		{nil, "call", 0, "Call"},
		{ptr("guest-meeting-card:{\"title\":\"Some meetup\"}"), "text", 0, "Guest meeting: Some meetup"},
		{ptr("guest-meeting-card:not-json"), "text", 0, "Guest meeting"},
	}
	for _, tt := range cases {
		if got := deriveMessagePreview(tt.content, tt.messageType, tt.attachmentCount); got != tt.want {
			t.Errorf("deriveMessagePreview(%v, %q, %d) = %q, want %q", tt.content, tt.messageType, tt.attachmentCount, got, tt.want)
		}
	}
}

func ptr(value string) *string { return &value }
