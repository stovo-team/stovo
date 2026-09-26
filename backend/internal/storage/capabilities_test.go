package storage

import (
	"context"
	"testing"

	"stovo-messenger/backend/internal/ports"
)

func TestLocalStorageExposesOnlySupportedCapabilities(t *testing.T) {
	store, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocalStorage() error = %v", err)
	}
	if _, ok := any(store).(ports.ObjectStore); !ok {
		t.Fatal("LocalStorage must support ordinary object storage")
	}
	if _, ok := any(store).(ports.BucketObjectStore); !ok {
		t.Fatal("LocalStorage must support bucket-compatible local persistence")
	}
	if _, ok := any(store).(ports.PresignedObjectStore); ok {
		t.Fatal("LocalStorage must not advertise unsupported presigning")
	}
}

func TestLocalStorageReadsTranscriptionChunkFromConfiguredBucket(t *testing.T) {
	store, err := NewLocalStorage(t.TempDir())
	if err != nil {
		t.Fatalf("NewLocalStorage() error = %v", err)
	}
	const key = "calls/chat/session/audio/user/000000.mp4"
	if err := store.SaveToBucket(context.Background(), "stovo-calls", key, []byte("audio"), "audio/mp4"); err != nil {
		t.Fatalf("SaveToBucket() error = %v", err)
	}
	got, err := store.ReadFromBucket(context.Background(), "stovo-calls", key)
	if err != nil {
		t.Fatalf("ReadFromBucket() error = %v", err)
	}
	if string(got) != "audio" {
		t.Fatalf("audio = %q, want %q", got, "audio")
	}
}
