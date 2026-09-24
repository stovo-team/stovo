package app

import (
	"testing"
	"time"
)

func TestIsBrokenFileAttachment(t *testing.T) {
	tests := []struct {
		name       string
		file       filePublic
		objectSize int
		want       bool
	}{
		{name: "zero-byte PDF", file: filePublic{MimeType: "application/pdf", SizeBytes: 0}, objectSize: 0, want: true},
		{name: "zero-byte image", file: filePublic{MimeType: "image/png", SizeBytes: 0}, objectSize: 0, want: true},
		{name: "empty text file", file: filePublic{MimeType: "text/plain", SizeBytes: 0}, objectSize: 0, want: false},
		{name: "unknown empty file", file: filePublic{MimeType: "application/octet-stream", SizeBytes: 0}, objectSize: 0, want: false},
		{name: "zero-size PDF record with content", file: filePublic{MimeType: "application/pdf", SizeBytes: 0}, objectSize: 10, want: false},
		{name: "non-empty PDF", file: filePublic{MimeType: "application/pdf", SizeBytes: 1}, objectSize: 0, want: false},
		{name: "deleted PDF", file: filePublic{MimeType: "application/pdf", SizeBytes: 0, DeletedAt: func() *time.Time { at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC); return &at }()}, objectSize: 0, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isBrokenFileAttachment(test.file, test.objectSize); got != test.want {
				t.Fatalf("isBrokenFileAttachment(%#v) = %t, want %t", test.file, got, test.want)
			}
		})
	}
}

