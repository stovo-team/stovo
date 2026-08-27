package messages

import (
	"context"

	"family-messenger/backend/internal/domain"
)

// Delivery is the post-persistence capability required by the message feature.
// It intentionally keeps broker publication and recipient notification behind
// one feature-owned boundary.
type Delivery interface {
	PublishMessageCreated(context.Context, domain.MessageCreated) error
	NotifyMessageRecipients(context.Context, domain.MessageNotification)
}

// DeliveryService coordinates post-persistence message work. Callers retain
// ownership of asynchronous execution and delivery fallbacks.
type DeliveryService struct {
	delivery Delivery
}

func NewDeliveryService(delivery Delivery) DeliveryService {
	return DeliveryService{delivery: delivery}
}

func (s DeliveryService) PublishCreated(ctx context.Context, event domain.MessageCreated) error {
	return s.delivery.PublishMessageCreated(ctx, event)
}

func (s DeliveryService) NotifyRecipients(ctx context.Context, notification domain.MessageNotification) {
	s.delivery.NotifyMessageRecipients(ctx, notification)
}
