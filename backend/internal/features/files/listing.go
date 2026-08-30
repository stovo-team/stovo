package files

import "context"

type ListingStore interface {
	VisibleFamilyFileIDs(context.Context, string) ([]string, error)
	ChatFileIDs(context.Context, string, string, int) ([]string, error)
}
type ListingService struct{ store ListingStore }

func NewListingService(store ListingStore) *ListingService { return &ListingService{store: store} }
func (s *ListingService) VisibleFamilyFileIDs(ctx context.Context, familyID string) ([]string, error) {
	return s.store.VisibleFamilyFileIDs(ctx, familyID)
}

func (s *ListingService) ChatFileIDs(ctx context.Context, familyID, chatID string, limit int) ([]string, error) {
	return s.store.ChatFileIDs(ctx, familyID, chatID, limit)
}
