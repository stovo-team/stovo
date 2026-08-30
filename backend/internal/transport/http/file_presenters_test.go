package http

import (
	"encoding/json"
	"testing"
	"time"
)

func TestPresentDirectFileUploadPreservesFileUploadJSONContract(t *testing.T) {
	response := PresentDirectFileUpload("upload-1", "file-1", "reserved", "image/png", 42)
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"uploadId":"upload-1","fileId":"file-1","state":"reserved","expectedMimeType":"image/png","expectedSizeBytes":42}`
	if string(encoded) != want {
		t.Fatalf("JSON contract changed: got %s, want %s", encoded, want)
	}
}

func TestFileTransportModelsUseStableJSONFields(t *testing.T) {
	checksum := "abc"
	expiresAt := time.Date(2026, 8, 30, 0, 0, 0, 0, time.UTC)
	encoded, err := json.Marshal(DirectFileAccessResponse{FileID: "file-1", URL: "https://example.test/file", ExpiresAt: expiresAt, MimeType: "audio/webm", SizeBytes: 7, Checksum: &checksum})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"fileId":"file-1","url":"https://example.test/file","expiresAt":"2026-08-30T00:00:00Z","mimeType":"audio/webm","sizeBytes":7,"checksum":"abc"}`
	if string(encoded) != want {
		t.Fatalf("JSON contract changed: got %s, want %s", encoded, want)
	}
}
