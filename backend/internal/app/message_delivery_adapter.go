package app

import (
	"context"

	"stovo-messenger/backend/internal/domain"
	"stovo-messenger/backend/internal/ports"
)

// messageDeliveryAdapter bridges the delivery use case to the current broker
// and notification implementations. Message creation keeps its fallback local.
type messageDeliveryAdapter struct {
	server *Server
}

func newMessageDeliveryAdapter(server *Server) messageDeliveryAdapter {
	return messageDeliveryAdapter{server: server}
}

func (a messageDeliveryAdapter) PublishMessageCreated(ctx context.Context, event domain.MessageCreated) error {
	return a.server.broker.Publish(ctx, brokerChannelMessages, ports.Event{
		"event_id":   event.EventID,
		"type":       "message.created",
		"chat_id":    event.ChatID,
		"message_id": event.MessageID,
		"payload":    event.Payload,
	})
}

func (a messageDeliveryAdapter) NotifyMessageRecipients(_ context.Context, notification domain.MessageNotification) {
	a.server.notifyMessageRecipients(
		notification.ChatID,
		notification.ChatType,
		notification.ChatTitle,
		notification.SenderID,
		notification.SenderName,
		notification.Preview,
		notification.MentionedUserIDs,
		notification.NotifyInForeground,
	)
}
