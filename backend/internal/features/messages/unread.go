package messages

import "context"

type UnreadStore interface {
	UnreadCount(context.Context, string, string) (int, error)
}
type UnreadService struct{ store UnreadStore }

func NewUnreadService(store UnreadStore) *UnreadService { return &UnreadService{store: store} }
func (s *UnreadService) Count(ctx context.Context, chatID, userID string) (int, error) {
	return s.store.UnreadCount(ctx, chatID, userID)
}
