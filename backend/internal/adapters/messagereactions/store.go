// Package messagereactions adapts reaction persistence for the messages
// feature while hiding Ent transactions from HTTP handlers.
package messagereactions

import (
	"context"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) MessageChatID(ctx context.Context, messageID string) (string, error) {
	meta, err := s.repository.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return "", err
	}
	return meta.ChatID, nil
}
func (s *Store) SetReaction(ctx context.Context, change featuremessages.ReactionChange) error {
	return s.repository.SetMessageReaction(ctx, change.MessageID, change.UserID, change.Emoji, change.CreatedAt)
}
func (s *Store) RemoveReaction(ctx context.Context, change featuremessages.ReactionChange) error {
	return s.repository.RemoveMessageReaction(ctx, change.MessageID, change.UserID, change.Emoji)
}
