package chats

import (
	"context"
	"errors"
	"testing"
)

type creationStoreFake struct {
	command CreateChat
	members AddMembers
	err     error
}

func (s *creationStoreFake) CreateChat(_ context.Context, command CreateChat) error {
	s.command = command
	return s.err
}

func (s *creationStoreFake) AddMembers(_ context.Context, command AddMembers) error {
	s.members = command
	return s.err
}
func TestCreationServiceDelegatesAtomicCommand(t *testing.T) {
	store := &creationStoreFake{}
	service := NewCreationService(store)
	if err := service.Create(context.Background(), CreateChat{ID: "chat", MemberIDs: []string{"user"}}); err != nil || store.command.ID != "chat" {
		t.Fatalf("command=%+v err=%v", store.command, err)
	}
	store.err = errors.New("failed")
	if err := service.Create(context.Background(), CreateChat{}); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}

func TestCreationServiceAddsMembersAsOneAtomicCommand(t *testing.T) {
	store := &creationStoreFake{}
	service := NewCreationService(store)
	command := AddMembers{ChatID: "chat", UserIDs: []string{"user"}, CreatedAt: "now"}
	if err := service.AddMembers(context.Background(), command); err != nil || store.members.ChatID != "chat" {
		t.Fatalf("members=%+v err=%v", store.members, err)
	}
}
