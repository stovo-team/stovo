package services

import (
	"context"

	"family-messenger/backend/internal/domain"
	"family-messenger/backend/internal/ports"
)

// MessageDeliveryService keeps post-persistence delivery separate from message
// creation. Callers retain control over asynchronous execution and fallbacks.
type MessageDeliveryService struct {
	delivery ports.MessageDelivery
}

func NewMessageDeliveryService(delivery ports.MessageDelivery) MessageDeliveryService {
	return MessageDeliveryService{delivery: delivery}
}

// PublishCreated forwards the durable message-created event to the broker.
func (s MessageDeliveryService) PublishCreated(ctx context.Context, event domain.MessageCreated) error {
	return s.delivery.PublishMessageCreated(ctx, event)
}

// NotifyRecipients emits recipient notifications after message persistence.
func (s MessageDeliveryService) NotifyRecipients(ctx context.Context, notification domain.MessageNotification) {
	s.delivery.NotifyMessageRecipients(ctx, notification)
}
