// Package services coordinates domain rules through narrow ports.
package services

import (
	"family-messenger/backend/internal/features/calls"
	"family-messenger/backend/internal/ports"
)

var (
	ErrCallsUnavailable = calls.ErrUnavailable
	ErrNotChatMember    = calls.ErrNotChatMember
	ErrNoParticipants   = calls.ErrNoParticipants
)

// StartCallInput and CallService remain source-compatible aliases. New code
// should use the calls feature package directly.
type StartCallInput = calls.StartInput
type CallService = calls.Service

func NewCallService(chats ports.CallChatReader, privacy ports.DirectCallPrivacyChecker, active ports.ActiveCallReader) *CallService {
	return calls.NewService(chats, privacy, active)
}
