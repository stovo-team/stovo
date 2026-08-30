package messageforwards

import (
	"context"

	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) FindActiveForward(ctx context.Context, chatID, sourceMessageID string) (string, error) {
	return s.repository.FindActiveForwardInChat(ctx, chatID, sourceMessageID)
}

var _ featuremessages.ForwardLookupStore = (*Store)(nil)
