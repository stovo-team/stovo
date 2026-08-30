package messages

import (
	"context"
	"errors"
	"testing"
)

type reactionStoreFake struct {
	change  ReactionChange
	chatID  string
	err     error
	removed bool
}

func (s *reactionStoreFake) MessageChatID(_ context.Context, _ string) (string, error) {
	return s.chatID, s.err
}
func (s *reactionStoreFake) SetReaction(_ context.Context, change ReactionChange) error {
	s.change = change
	return s.err
}
func (s *reactionStoreFake) RemoveReaction(_ context.Context, change ReactionChange) error {
	s.change, s.removed = change, true
	return s.err
}
func TestReactionServiceValidatesAndDelegates(t *testing.T) {
	store := &reactionStoreFake{chatID: "chat"}
	service := NewReactionService(store)
	if err := service.Change(context.Background(), ReactionChange{Emoji: " 👍 ", Add: true}); err != nil || store.change.Emoji != "👍" {
		t.Fatalf("change=%+v err=%v", store.change, err)
	}
	if err := service.Change(context.Background(), ReactionChange{Emoji: "", Add: true}); !errors.Is(err, ErrInvalidReaction) {
		t.Fatalf("err=%v", err)
	}
	if err := service.Change(context.Background(), ReactionChange{Emoji: "x", Add: false}); err != nil || !store.removed {
		t.Fatalf("remove err=%v removed=%v", err, store.removed)
	}
}
