// Package calls contains application rules for starting calls.
package calls

import (
	"context"
	"errors"
	"fmt"

	"stovo-messenger/backend/internal/domain"
)

var (
	ErrUnavailable    = errors.New("calls are unavailable in this chat")
	ErrNotChatMember  = errors.New("caller is not a member of this chat")
	ErrNoParticipants = errors.New("could not determine call participants")
)

// ChatReader supplies only the conversation data required to begin a call.
type ChatReader interface {
	CallChat(context.Context, string) (domain.CallChat, error)
}

// DirectPrivacyChecker answers whether a direct-call invite is blocked.
type DirectPrivacyChecker interface {
	DirectCallBlocked(context.Context, string, string) (bool, error)
}

// ActiveCallReader exposes a user's active chat for conflict checks.
type ActiveCallReader interface {
	ActiveCallChat(context.Context, string) (chatID string, active bool, err error)
}

type StartInput struct {
	ChatID        string
	CallerUserID  string
	CallType      string
	InviteUserIDs []string
}

// Service prepares a validated call initiation. Session locking, persistence,
// and realtime emission remain transport/runtime responsibilities.
type Service struct {
	chats   ChatReader
	privacy DirectPrivacyChecker
	active  ActiveCallReader
}

func NewService(chats ChatReader, privacy DirectPrivacyChecker, active ActiveCallReader) *Service {
	return &Service{chats: chats, privacy: privacy, active: active}
}

func (s *Service) PrepareStart(ctx context.Context, input StartInput) (domain.CallInitiation, error) {
	chat, err := s.chats.CallChat(ctx, input.ChatID)
	if err != nil {
		return domain.CallInitiation{}, fmt.Errorf("load call chat: %w", err)
	}
	if !chat.Type.SupportsCalls() {
		return domain.CallInitiation{}, ErrUnavailable
	}
	if !chat.HasMember(input.CallerUserID) {
		return domain.CallInitiation{}, ErrNotChatMember
	}
	invitees, err := s.resolveInvitees(chat, input.CallerUserID, input.InviteUserIDs)
	if err != nil {
		return domain.CallInitiation{}, err
	}
	if err := s.validatePrivacy(ctx, chat.Type, input.CallerUserID, invitees); err != nil {
		return domain.CallInitiation{}, err
	}
	if err := s.validateAvailability(ctx, chat.ID, append([]string{input.CallerUserID}, invitees...)); err != nil {
		return domain.CallInitiation{}, err
	}
	participants := make([]domain.CallParticipant, 0, len(invitees)+1)
	participants = append(participants, domain.CallParticipant{UserID: input.CallerUserID, Role: domain.ParticipantHost})
	for _, userID := range invitees {
		participants = append(participants, domain.CallParticipant{UserID: userID, Role: domain.ParticipantMember})
	}
	return domain.CallInitiation{ChatID: chat.ID, CallerUserID: input.CallerUserID, CallType: domain.NormalizeCallType(input.CallType), Participants: participants, StartsActive: chat.Type.StartsConnected()}, nil
}

func (s *Service) resolveInvitees(chat domain.CallChat, caller string, requested []string) ([]string, error) {
	invitees := domain.CleanUserIDs(requested, caller)
	if len(requested) > 0 {
		for _, userID := range invitees {
			if !chat.HasMember(userID) {
				return nil, errors.New("invitee is not a member of this chat")
			}
		}
	} else if chat.Type != domain.ChatTypeVoice {
		for _, userID := range chat.Members {
			if userID != caller {
				invitees = append(invitees, userID)
				if chat.Type == domain.ChatTypeDirect {
					break
				}
			}
		}
	}
	if len(invitees) == 0 && chat.Type != domain.ChatTypeVoice {
		return nil, ErrNoParticipants
	}
	return invitees, nil
}

func (s *Service) validatePrivacy(ctx context.Context, kind domain.ChatType, caller string, invitees []string) error {
	if kind != domain.ChatTypeDirect || s.privacy == nil {
		return nil
	}
	for _, invitee := range invitees {
		blocked, err := s.privacy.DirectCallBlocked(ctx, caller, invitee)
		if err != nil {
			return errors.New("could not check privacy settings")
		}
		if blocked {
			return errors.New("calls are unavailable for this member")
		}
	}
	return nil
}

func (s *Service) validateAvailability(ctx context.Context, chatID string, users []string) error {
	if s.active == nil {
		return nil
	}
	for index, userID := range users {
		activeChatID, active, err := s.active.ActiveCallChat(ctx, userID)
		if err != nil {
			return errors.New("could not check call availability")
		}
		if active && activeChatID != chatID {
			if index == 0 {
				return errors.New("you are already in another call")
			}
			return errors.New("participant is busy in another call")
		}
	}
	return nil
}
