package storage

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func TestMinIOReadFromBucketUsesExplicitBucket(t *testing.T) {
	var requests []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.Method+" "+r.URL.RequestURI())
		if r.URL.Query().Has("location") {
			w.Header().Set("Content-Type", "application/xml")
			_, _ = io.WriteString(w, `<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>`)
			return
		}
		if r.Method == http.MethodHead {
			w.Header().Set("Content-Length", "5")
			w.Header().Set("ETag", `"audio-etag"`)
			w.Header().Set("Last-Modified", "Mon, 02 Jan 2006 15:04:05 GMT")
			w.Header().Set("Content-Type", "audio/mp4")
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Length", "5")
			w.Header().Set("ETag", `"audio-etag"`)
			w.Header().Set("Last-Modified", "Mon, 02 Jan 2006 15:04:05 GMT")
			w.Header().Set("Content-Type", "audio/mp4")
			_, _ = io.WriteString(w, "audio")
			return
		}
		t.Errorf("unexpected S3 method %s", r.Method)
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer server.Close()

	client, err := minio.New(strings.TrimPrefix(server.URL, "http://"), &minio.Options{
		Creds:        credentials.NewStaticV4("access", "secret", ""),
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		t.Fatalf("minio.New() error = %v", err)
	}
	store := &MinIOStorage{client: client, bucket: "files"}

	got, err := store.ReadFromBucket(context.Background(), "calls", "calls/chat/session/audio/user/000000.mp4")
	if err != nil {
		t.Fatalf("ReadFromBucket() error = %v; requests = %v", err, requests)
	}
	if string(got) != "audio" {
		t.Fatalf("audio = %q, want %q", got, "audio")
	}
	foundCallsBucketRead := false
	for _, request := range requests {
		if strings.HasPrefix(request, "HEAD /calls/calls/") {
			foundCallsBucketRead = true
			break
		}
	}
	if !foundCallsBucketRead {
		t.Fatalf("requests = %q, want explicit calls bucket", requests)
	}
}
