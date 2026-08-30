package messages

import (
	"context"
	"errors"
	"testing"
)

type attachmentStoreFake struct {
	command AttachmentCommand
	err     error
}

func (s *attachmentStoreFake) Attach(_ context.Context, command AttachmentCommand) error {
	s.command = command
	return s.err
}

func TestAttachmentServiceDeduplicatesAtomicCommand(t *testing.T) {
	store := &attachmentStoreFake{}
	service := NewAttachmentService(store)
	if err := service.Attach(context.Background(), AttachmentCommand{MessageID: "message", FileIDs: []string{" file-a ", "file-a", "", "file-b"}}); err != nil {
		t.Fatal(err)
	}
	if got := store.command.FileIDs; len(got) != 2 || got[0] != "file-a" || got[1] != "file-b" {
		t.Fatalf("file IDs = %#v", got)
	}
	store.err = errors.New("transaction failed")
	if err := service.Attach(context.Background(), AttachmentCommand{}); !errors.Is(err, store.err) {
		t.Fatalf("err = %v", err)
	}
}
