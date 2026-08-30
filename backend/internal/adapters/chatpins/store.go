// Package chatpins adapts Ent pin persistence to the chats feature port.
package chatpins

import (
	"context"
	"stovo-messenger/backend/ent"
	featurechats "stovo-messenger/backend/internal/features/chats"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) ActiveMessageChatID(ctx context.Context, messageID string) (string, error) {
	chatID, err := s.repository.MessageChatIDIfActive(ctx, messageID)
	return chatID, mapError(err)
}
func (s *Store) TryPin(ctx context.Context, pin featurechats.Pin) (bool, error) {
	created, err := s.repository.TryPinMessage(ctx, pin.ChatID, pin.MessageID, pin.PinnedBy, pin.PinnedAt)
	return created, mapError(err)
}
func (s *Store) Pin(ctx context.Context, chatID, messageID string) (featurechats.Pin, error) {
	row, err := s.repository.GetPin(ctx, chatID, messageID)
	if err != nil {
		return featurechats.Pin{}, mapError(err)
	}
	return featurechats.Pin{ChatID: chatID, MessageID: messageID, PinnedBy: row.PinnedBy, PinnedAt: row.PinnedAt.UTC()}, nil
}
func (s *Store) DeletePin(ctx context.Context, chatID, messageID string) error {
	return mapError(s.repository.DeletePin(ctx, chatID, messageID))
}
func (s *Store) ActivePins(ctx context.Context, chatID string) ([]featurechats.Pin, error) {
	rows, err := s.repository.ListActivePins(ctx, chatID)
	if err != nil {
		return nil, mapError(err)
	}
	pins := make([]featurechats.Pin, 0, len(rows))
	for _, row := range rows {
		pins = append(pins, featurechats.Pin{ChatID: chatID, MessageID: row.MessageID, PinnedBy: row.PinnedBy, PinnedAt: row.PinnedAt.UTC()})
	}
	return pins, nil
}
func mapError(err error) error {
	if ent.IsNotFound(err) {
		return featurechats.ErrNotFound
	}
	return err
}
