package messages

import (
	"context"
	"errors"
	"testing"
)

type persistenceStoreFake struct {
	bundle MessageBundle
	err    error
}

func (f *persistenceStoreFake) CreateMessageBundle(_ context.Context, bundle MessageBundle) error {
	f.bundle = bundle
	return f.err
}

func TestPersistenceServiceCreateDelegatesAtomicBundle(t *testing.T) {
	store := &persistenceStoreFake{}
	bundle := MessageBundle{MessageID: "message-1", ChatID: "chat-1", SenderID: "user-1", AttachmentFileIDs: []string{"file-1"}}
	if err := NewPersistenceService(store).Create(context.Background(), bundle); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if store.bundle.MessageID != bundle.MessageID || len(store.bundle.AttachmentFileIDs) != 1 {
		t.Fatalf("bundle = %#v, want %#v", store.bundle, bundle)
	}
}

func TestPersistenceServiceCreatePropagatesStoreFailure(t *testing.T) {
	want := errors.New("transaction failed")
	if err := NewPersistenceService(&persistenceStoreFake{err: want}).Create(context.Background(), MessageBundle{}); !errors.Is(err, want) {
		t.Fatalf("Create error = %v, want %v", err, want)
	}
}
