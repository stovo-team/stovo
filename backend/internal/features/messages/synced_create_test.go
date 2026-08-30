package messages

import (
	"context"
	"errors"
	"testing"
)

type syncedMessageStoreFake struct {
	command CreateSyncedMessage
	result  CreateSyncedMessageResult
	err     error
}

func (s *syncedMessageStoreFake) CreateSyncedMessage(_ context.Context, command CreateSyncedMessage) (CreateSyncedMessageResult, error) {
	s.command = command
	return s.result, s.err
}

func TestSyncedMessageServiceDelegatesAtomicCommand(t *testing.T) {
	store := &syncedMessageStoreFake{result: CreateSyncedMessageResult{ResponsePayload: []byte(`{"id":"message"}`)}}
	service := NewSyncedMessageService(store)
	result, err := service.Create(context.Background(), CreateSyncedMessage{ActorID: "user", Message: SyncedMessage{ID: "message"}})
	if err != nil || store.command.ActorID != "user" || store.command.Message.ID != "message" || string(result.ResponsePayload) != `{"id":"message"}` {
		t.Fatalf("command=%+v result=%+v err=%v", store.command, result, err)
	}
	store.err = errors.New("write failed")
	if _, err := service.Create(context.Background(), CreateSyncedMessage{}); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
