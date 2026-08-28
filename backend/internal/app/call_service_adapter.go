package app

import (
	"context"
	"errors"
	"fmt"

	"stovo-messenger/backend/internal/domain"
	"stovo-messenger/backend/internal/features/calls"
)

// prepareCallInitiation adapts the existing app data to the pure call use case.
// Session locking, persistence, and emission deliberately remain in calls.go.
func (s *Server) prepareCallInitiation(chat chatPublic, callerUserID, callType string, inviteUserIDs []string) (domain.CallInitiation, error) {
	service := calls.NewService(callChatReader{chat: callChatFromPublic(chat)}, directCallPrivacyCheck(s.directContactBlocked), nil)
	initiation, err := service.PrepareStart(context.Background(), calls.StartInput{
		ChatID: chat.ID, CallerUserID: callerUserID, CallType: callType, InviteUserIDs: inviteUserIDs,
	})
	if errors.Is(err, calls.ErrNotChatMember) {
		return domain.CallInitiation{}, fmt.Errorf("you are not a member of this chat")
	}
	return initiation, err
}

type callChatReader struct{ chat domain.CallChat }

func (r callChatReader) CallChat(context.Context, string) (domain.CallChat, error) {
	return r.chat, nil
}

type directCallPrivacyCheck func(callerUserID, inviteeUserID string) (bool, error)

func (check directCallPrivacyCheck) DirectCallBlocked(_ context.Context, callerUserID, inviteeUserID string) (bool, error) {
	return check(callerUserID, inviteeUserID)
}

func callChatFromPublic(chat chatPublic) domain.CallChat {
	members := make([]string, 0, len(chat.Members))
	for _, member := range chat.Members {
		members = append(members, member.ID)
	}
	return domain.CallChat{ID: chat.ID, Type: domain.ChatType(chat.Type), Members: members}
}
