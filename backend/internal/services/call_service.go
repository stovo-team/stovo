// Package services coordinates domain rules through narrow ports.
package services

import (
	"context"
	"errors"
	"fmt"

	"family-messenger/backend/internal/domain"
	"family-messenger/backend/internal/ports"
)

var (
	ErrCallsUnavailable = errors.New("calls are unavailable in this chat")
	ErrNotChatMember    = errors.New("caller is not a member of this chat")
	ErrNoParticipants   = errors.New("could not determine call participants")
)

type StartCallInput struct {
	ChatID        string
	CallerUserID  string
	CallType      string
	InviteUserIDs []string
}

type CallService struct {
	chats   ports.CallChatReader
	privacy ports.DirectCallPrivacyChecker
	active  ports.ActiveCallReader
}

func NewCallService(chats ports.CallChatReader, privacy ports.DirectCallPrivacyChecker, active ports.ActiveCallReader) *CallService {
	return &CallService{chats: chats, privacy: privacy, active: active}
}

func (s *CallService) PrepareStart(ctx context.Context, input StartCallInput) (domain.CallInitiation, error) {
	chat, err := s.chats.CallChat(ctx, input.ChatID)
	if err != nil {
		return domain.CallInitiation{}, fmt.Errorf("load call chat: %w", err)
	}
	if !chat.Type.SupportsCalls() {
		return domain.CallInitiation{}, ErrCallsUnavailable
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

func (s *CallService) resolveInvitees(chat domain.CallChat, caller string, requested []string) ([]string, error) {
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

func (s *CallService) validatePrivacy(ctx context.Context, kind domain.ChatType, caller string, invitees []string) error {
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

func (s *CallService) validateAvailability(ctx context.Context, chatID string, users []string) error {
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
