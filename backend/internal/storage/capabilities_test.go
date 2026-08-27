package storage

import (
	"testing"

	"family-messenger/backend/internal/ports"
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
