package app

import (
	"context"

	"family-messenger/backend/internal/domain"
)

// messagePolicyAdapter keeps application infrastructure at the outer edge
// while services.MessageService owns the send-policy decision.
type messagePolicyAdapter struct {
	server *Server
}

func (a messagePolicyAdapter) DirectContactBlocked(_ context.Context, senderID, recipientID string) (bool, error) {
	blocked, err := a.server.directContactBlocked(senderID, recipientID)
	if err != nil {
		return false, newStatusError(500, "could not check privacy settings")
	}
	return blocked, nil
}

func (a messagePolicyAdapter) CanPost(chat domain.Chat, sender domain.Sender) bool {
	return a.server.canSendToChat(chatPublic{Type: chat.Type, CreatedBy: chat.CreatedBy}, userPublic{ID: sender.ID, Role: sender.Role})
}

func (a messagePolicyAdapter) ReplyBelongsToChat(_ context.Context, chatID, messageID string) (bool, error) {
	if err := a.server.validateReplyTarget(chatID, messageID); err != nil {
		return false, err
	}
	return true, nil
}

func messageDomainChat(chat chatPublic) domain.Chat {
	members := make([]domain.Member, 0, len(chat.Members))
	for _, member := range chat.Members {
		members = append(members, domain.Member{ID: member.ID})
	}
	return domain.Chat{ID: chat.ID, Type: chat.Type, CommentsEnabled: chat.CommentsEnabled, CreatedBy: chat.CreatedBy, Members: members}
}
