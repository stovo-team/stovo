package messageunread

import (
	"context"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) UnreadCount(ctx context.Context, chatID, userID string) (int, error) {
	return s.repository.UnreadMessageCount(ctx, chatID, userID)
}

var _ featuremessages.UnreadStore = (*Store)(nil)
