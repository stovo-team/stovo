package messages

import (
	"context"
	"errors"
	"strings"
)

var ErrInvalidReaction = errors.New("reaction emoji is required")

type ReactionChange struct {
	MessageID, UserID, Emoji, CreatedAt string
	Add                                 bool
}

type ReactionStore interface {
	MessageChatID(context.Context, string) (string, error)
	SetReaction(context.Context, ReactionChange) error
	RemoveReaction(context.Context, ReactionChange) error
}

type ReactionService struct{ store ReactionStore }

func NewReactionService(store ReactionStore) *ReactionService { return &ReactionService{store: store} }
func (s *ReactionService) MessageChatID(ctx context.Context, messageID string) (string, error) {
	return s.store.MessageChatID(ctx, messageID)
}
func (s *ReactionService) Change(ctx context.Context, change ReactionChange) error {
	change.Emoji = strings.TrimSpace(change.Emoji)
	if change.Emoji == "" || len([]rune(change.Emoji)) > 32 {
		return ErrInvalidReaction
	}
	if change.Add {
		return s.store.SetReaction(ctx, change)
	}
	return s.store.RemoveReaction(ctx, change)
}
