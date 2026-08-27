package services

import (
	"family-messenger/backend/internal/features/messages"
	"family-messenger/backend/internal/ports"
)

// MessageDeliveryService is retained for compatibility. New code uses the
// message feature's DeliveryService and consumer-owned Delivery port.
type MessageDeliveryService = messages.DeliveryService

func NewMessageDeliveryService(delivery ports.MessageDelivery) MessageDeliveryService {
	return messages.NewDeliveryService(delivery)
}
