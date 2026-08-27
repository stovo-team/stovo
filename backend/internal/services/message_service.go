// Package services coordinates domain rules through ports.
package services

import (
	"family-messenger/backend/internal/features/messages"
	"family-messenger/backend/internal/ports"
)

var (
	ErrMessageForbidden = messages.ErrForbidden
	ErrDirectBlocked    = messages.ErrDirectBlocked
	ErrInvalidReply     = messages.ErrInvalidReply
)

// MessageService is retained as a compatibility alias. New code belongs in
// features/messages, which owns the policy and its consumer-facing port.
type MessageService = messages.Service

func NewMessageService(authorizer ports.MessageAuthorizer) MessageService {
	return messages.NewService(authorizer)
}
