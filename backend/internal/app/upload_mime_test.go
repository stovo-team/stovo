package app

import "testing"

func TestNormalizeUploadMimeUsesKnownExtensionForGenericBrowserMime(t *testing.T) {
	got, ok := normalizeUploadMime("application/octet-stream", "shared-photo.jpg")
	if !ok {
		t.Fatal("generic browser MIME type with a supported extension should be accepted")
	}
	if got != "image/jpeg" {
		t.Fatalf("normalized MIME type = %q, want image/jpeg", got)
	}
}

func TestNormalizeUploadMimeRejectsUnknownGenericBrowserMime(t *testing.T) {
	if _, ok := normalizeUploadMime("application/octet-stream", "archive.bin"); ok {
		t.Fatal("generic browser MIME type with an unknown extension must be rejected")
	}
}
