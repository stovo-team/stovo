package messages

import "context"

type ReadTarget struct{ MessageID, ChatID, SenderID, CreatedAt string }
type ReadCommand struct {
	Target         ReadTarget
	UserID, ReadAt string
}
type ReadStore interface {
	ReadTarget(context.Context, string) (ReadTarget, error)
	MarkRead(context.Context, ReadCommand) error
}
type ReadService struct{ store ReadStore }

func NewReadService(store ReadStore) *ReadService { return &ReadService{store: store} }
func (s *ReadService) Target(ctx context.Context, messageID string) (ReadTarget, error) {
	return s.store.ReadTarget(ctx, messageID)
}
func (s *ReadService) Mark(ctx context.Context, command ReadCommand) error {
	return s.store.MarkRead(ctx, command)
}
