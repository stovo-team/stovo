package ports

import (
	"context"

	"stovo-messenger/backend/internal/domain"
)

// CallChatReader supplies only the chat data needed to begin a call.
type CallChatReader interface {
	CallChat(ctx context.Context, chatID string) (domain.CallChat, error)
}

// DirectCallPrivacyChecker answers whether a direct-call invite is blocked.
type DirectCallPrivacyChecker interface {
	DirectCallBlocked(ctx context.Context, callerUserID, inviteeUserID string) (bool, error)
}

// ActiveCallReader exposes a user's active chat, if any, for conflict checks.
type ActiveCallReader interface {
	ActiveCallChat(ctx context.Context, userID string) (chatID string, active bool, err error)
}
