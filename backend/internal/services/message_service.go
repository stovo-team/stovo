// Package services coordinates domain rules through ports.
package services

import (
	"context"
	"errors"
	"strings"

	"family-messenger/backend/internal/domain"
	"family-messenger/backend/internal/ports"
)

var (
	ErrMessageForbidden = errors.New("message sending is not permitted")
	ErrDirectBlocked    = errors.New("direct messages are unavailable for this member")
	ErrInvalidReply     = errors.New("reply target does not belong to this chat")
)

// MessageService applies the policy shared by HTTP, socket, and generated sends.
type MessageService struct {
	authorizer ports.MessageAuthorizer
}

func NewMessageService(authorizer ports.MessageAuthorizer) MessageService {
	return MessageService{authorizer: authorizer}
}

// ValidateSend normalises reply references and validates direct-message and
// channel-comment rules before persistence. It mirrors app message-send policy.
func (s MessageService) ValidateSend(ctx context.Context, chat domain.Chat, sender domain.Sender, input *domain.SendMessage) error {
	if input == nil {
		return ErrMessageForbidden
	}
	if chat.Type == "direct" {
		for _, member := range chat.Members {
			if member.ID == sender.ID {
				continue
			}
			blocked, err := s.authorizer.DirectContactBlocked(ctx, sender.ID, member.ID)
			if err != nil {
				return err
			}
			if blocked {
				return ErrDirectBlocked
			}
		}
	}
	threadRoot := trim(input.ThreadRootMessageID)
	if !s.authorizer.CanPost(chat, sender) {
		if chat.Type != "channel" || !chat.CommentsEnabled || threadRoot == nil {
			return ErrMessageForbidden
		}
		if err := s.validateReply(ctx, chat.ID, *threadRoot); err != nil {
			return err
		}
		input.ThreadRootMessageID, input.ReplyToMessageID = threadRoot, nil
		return nil
	}
	if reply := trim(input.ReplyToMessageID); reply != nil {
		if err := s.validateReply(ctx, chat.ID, *reply); err != nil {
			return err
		}
		input.ReplyToMessageID = reply
	} else {
		input.ReplyToMessageID = nil
	}
	if root := trim(input.ThreadRootMessageID); root != nil {
		if err := s.validateReply(ctx, chat.ID, *root); err != nil {
			return err
		}
		input.ThreadRootMessageID = root
	} else {
		input.ThreadRootMessageID = nil
	}
	return nil
}

func (s MessageService) validateReply(ctx context.Context, chatID, messageID string) error {
	valid, err := s.authorizer.ReplyBelongsToChat(ctx, chatID, messageID)
	if err != nil {
		return err
	}
	if !valid {
		return ErrInvalidReply
	}
	return nil
}

func trim(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
