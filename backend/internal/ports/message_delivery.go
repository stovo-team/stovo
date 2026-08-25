package ports

import (
	"context"

	"family-messenger/backend/internal/domain"
)

// MessageDelivery publishes realtime events and recipient notifications for a
// message that has already been committed to the message store.
type MessageDelivery interface {
	PublishMessageCreated(ctx context.Context, event domain.MessageCreated) error
	NotifyMessageRecipients(ctx context.Context, notification domain.MessageNotification)
}
