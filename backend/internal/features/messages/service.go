// Package messages contains application rules for sending chat messages.
package messages

import (
	"context"
	"errors"
	"strings"

	"stovo-messenger/backend/internal/domain"
)

var (
	ErrForbidden     = errors.New("message sending is not permitted")
	ErrDirectBlocked = errors.New("direct messages are unavailable for this member")
	ErrInvalidReply  = errors.New("reply target does not belong to this chat")
)

// Authorizer is the consumer-owned policy boundary required to validate a
// message before it is persisted. Implementations may combine membership,
// privacy, and message lookup adapters.
type Authorizer interface {
	DirectContactBlocked(context.Context, string, string) (bool, error)
	CanPost(domain.Chat, domain.Sender) bool
	ReplyBelongsToChat(context.Context, string, string) (bool, error)
}

// Service applies transport-independent send policy. Persistence, content
// validation, and delivery are deliberately separate use cases.
type Service struct {
	authorizer Authorizer
}

func NewService(authorizer Authorizer) Service {
	return Service{authorizer: authorizer}
}

// ValidateSend normalizes reply references and validates direct-message and
// channel-comment rules before persistence.
func (s Service) ValidateSend(ctx context.Context, chat domain.Chat, sender domain.Sender, input *domain.SendMessage) error {
	if input == nil {
		return ErrForbidden
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
			return ErrForbidden
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

func (s Service) validateReply(ctx context.Context, chatID, messageID string) error {
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
