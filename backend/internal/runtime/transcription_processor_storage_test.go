package runtime

import (
	"context"
	"errors"
	"testing"
)

type transcriptionBucketReaderFake struct {
	bucket string
	key    string
	data   []byte
	err    error
}

func (f *transcriptionBucketReaderFake) ReadFromBucket(_ context.Context, bucket, key string) ([]byte, error) {
	f.bucket = bucket
	f.key = key
	return f.data, f.err
}

func TestReadTranscriptionChunkUsesConfiguredCallsBucket(t *testing.T) {
	store := &transcriptionBucketReaderFake{data: []byte("audio")}
	got, err := readTranscriptionChunk(context.Background(), store, "stovo-calls", "calls/chat/session/audio/user/000000.mp4")
	if err != nil {
		t.Fatalf("readTranscriptionChunk() error = %v", err)
	}
	if string(got) != "audio" {
		t.Fatalf("audio = %q, want %q", got, "audio")
	}
	if store.bucket != "stovo-calls" {
		t.Errorf("bucket = %q, want calls bucket %q", store.bucket, "stovo-calls")
	}
	if store.key != "calls/chat/session/audio/user/000000.mp4" {
		t.Errorf("key = %q, want original chunk key", store.key)
	}
}

func TestReadTranscriptionChunkReturnsMissingObjectError(t *testing.T) {
	wantErr := errors.New("object missing from calls bucket")
	store := &transcriptionBucketReaderFake{err: wantErr}
	_, err := readTranscriptionChunk(context.Background(), store, "stovo-calls", "missing.mp4")
	if !errors.Is(err, wantErr) {
		t.Fatalf("readTranscriptionChunk() error = %v, want %v", err, wantErr)
	}
}
