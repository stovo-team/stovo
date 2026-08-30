// Package messagereads adapts durable message read state to the messages feature.
package messagereads

import (
	"context"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) ReadTarget(ctx context.Context, messageID string) (featuremessages.ReadTarget, error) {
	meta, err := s.repository.GetActiveMessageMeta(ctx, messageID)
	if err != nil {
		return featuremessages.ReadTarget{}, err
	}
	return featuremessages.ReadTarget{MessageID: meta.ID, ChatID: meta.ChatID, SenderID: meta.SenderID, CreatedAt: meta.CreatedAt}, nil
}
func (s *Store) MarkRead(ctx context.Context, command featuremessages.ReadCommand) error {
	return s.repository.MarkMessagesRead(ctx, command.Target.ChatID, command.UserID, command.Target.MessageID, command.Target.CreatedAt, command.ReadAt, command.Target.SenderID == command.UserID)
}
