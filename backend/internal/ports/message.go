package ports

import (
	"context"

	"stovo-messenger/backend/internal/domain"
)

// MessageAuthorizer supplies policy checks needed before a message is stored.
// Implementations may use chat membership, roles, and the message repository.
type MessageAuthorizer interface {
	DirectContactBlocked(ctx context.Context, senderID, recipientID string) (bool, error)
	CanPost(chat domain.Chat, sender domain.Sender) bool
	ReplyBelongsToChat(ctx context.Context, chatID, messageID string) (bool, error)
}
