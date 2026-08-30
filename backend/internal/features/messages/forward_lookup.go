package messages

import "context"

// ForwardLookupStore is the messages feature's read port for archive
// idempotency. It deliberately returns only the message identifier.
type ForwardLookupStore interface {
	FindActiveForward(context.Context, string, string) (string, error)
}

type ForwardLookupService struct{ store ForwardLookupStore }

func NewForwardLookupService(store ForwardLookupStore) *ForwardLookupService {
	return &ForwardLookupService{store: store}
}

func (s *ForwardLookupService) Existing(ctx context.Context, chatID, sourceMessageID string) (string, error) {
	return s.store.FindActiveForward(ctx, chatID, sourceMessageID)
}
