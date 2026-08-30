package messages

import (
	"context"
	"errors"
	"testing"
)

type readStoreFake struct {
	target  ReadTarget
	command ReadCommand
	err     error
}

func (s *readStoreFake) ReadTarget(_ context.Context, _ string) (ReadTarget, error) {
	return s.target, s.err
}
func (s *readStoreFake) MarkRead(_ context.Context, command ReadCommand) error {
	s.command = command
	return s.err
}
func TestReadServiceDelegatesTargetAndCommand(t *testing.T) {
	store := &readStoreFake{target: ReadTarget{ChatID: "chat"}}
	service := NewReadService(store)
	target, err := service.Target(context.Background(), "message")
	if err != nil || target.ChatID != "chat" {
		t.Fatalf("target=%+v err=%v", target, err)
	}
	if err := service.Mark(context.Background(), ReadCommand{UserID: "user"}); err != nil || store.command.UserID != "user" {
		t.Fatalf("command=%+v err=%v", store.command, err)
	}
	store.err = errors.New("failed")
	if _, err := service.Target(context.Background(), "message"); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
