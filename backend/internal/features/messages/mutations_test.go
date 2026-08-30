package messages

import (
	"context"
	"errors"
	"testing"
)

type mutationStoreFake struct {
	plain     PlainEdit
	encrypted EncryptedEdit
	deletion  Deletion
	err       error
}

func (s *mutationStoreFake) EditPlain(_ context.Context, edit PlainEdit) error {
	s.plain = edit
	return s.err
}
func (s *mutationStoreFake) EditEncrypted(_ context.Context, edit EncryptedEdit) error {
	s.encrypted = edit
	return s.err
}
func (s *mutationStoreFake) Delete(_ context.Context, deletion Deletion) error {
	s.deletion = deletion
	return s.err
}
func TestMutationServiceDelegatesTypedCommands(t *testing.T) {
	store := &mutationStoreFake{}
	service := NewMutationService(store)
	if err := service.EditPlain(context.Background(), PlainEdit{MessageID: "message"}); err != nil || store.plain.MessageID != "message" {
		t.Fatalf("plain=%+v err=%v", store.plain, err)
	}
	if err := service.EditEncrypted(context.Background(), EncryptedEdit{Nonce: "nonce"}); err != nil || store.encrypted.Nonce != "nonce" {
		t.Fatalf("encrypted=%+v err=%v", store.encrypted, err)
	}
	if err := service.Delete(context.Background(), Deletion{ForUserOnly: true}); err != nil || !store.deletion.ForUserOnly {
		t.Fatalf("deletion=%+v err=%v", store.deletion, err)
	}
	store.err = errors.New("failed")
	if err := service.Delete(context.Background(), Deletion{}); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
