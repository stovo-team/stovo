package filelisting

import (
	"context"
	featurefiles "stovo-messenger/backend/internal/features/files"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) VisibleFamilyFileIDs(ctx context.Context, familyID string) ([]string, error) {
	return s.repository.ListVisibleFamilyFileIDs(ctx, familyID)
}

func (s *Store) ChatFileIDs(ctx context.Context, familyID, chatID string, limit int) ([]string, error) {
	return s.repository.ListChatFileIDs(ctx, familyID, chatID, limit)
}

var _ featurefiles.ListingStore = (*Store)(nil)
