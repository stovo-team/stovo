// Package calls contains application rules for starting calls.
package calls

import (
	"context"
	"errors"
	"fmt"
	"time"

	"stovo-messenger/backend/internal/domain"
)

// Session is the persistence-neutral durable representation of a live call.
// Runtime owns socket maps and Redis copies; this feature owns the durable
// lifecycle records used for recovery and history.
type Session struct {
	ID, ChatID, CallerID, CalleeID, CallType, Topology, State string
	CreatedAt                                                 time.Time
}

type Participant struct {
	RoomID, UserID, Role, State string
	JoinedAt                    *time.Time
}

type HistoryRecord struct {
	MessageID, ChatID, SenderID, EncryptionMetadata, CreatedAt, UpdatedAt string
}

type SessionStore interface {
	CreateSession(context.Context, Session) error
	UpdateSessionState(context.Context, string, string) error
	UpdateSessionTopology(context.Context, string, string) error
	EndSession(context.Context, string, int, time.Time) error
	UpsertParticipant(context.Context, Participant) error
	ActiveSessions(context.Context, time.Duration) ([]Session, error)
	Participants(context.Context, string) ([]Participant, error)
	RecordHistory(context.Context, HistoryRecord) error
}

// PersistenceService keeps transports from accessing a shared repository and
// leaves transaction details entirely inside the call persistence adapter.
type PersistenceService struct{ store SessionStore }

func NewPersistenceService(store SessionStore) *PersistenceService {
	return &PersistenceService{store: store}
}
func (s *PersistenceService) Create(ctx context.Context, session Session) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.CreateSession(ctx, session)
}
func (s *PersistenceService) SetState(ctx context.Context, id, state string) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.UpdateSessionState(ctx, id, state)
}
func (s *PersistenceService) SetTopology(ctx context.Context, id, topology string) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.UpdateSessionTopology(ctx, id, topology)
}
func (s *PersistenceService) End(ctx context.Context, id string, duration int, endedAt time.Time) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.EndSession(ctx, id, duration, endedAt)
}
func (s *PersistenceService) UpsertParticipant(ctx context.Context, participant Participant) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.UpsertParticipant(ctx, participant)
}
func (s *PersistenceService) Active(ctx context.Context, lookback time.Duration) ([]Session, error) {
	if s == nil || s.store == nil {
		return nil, nil
	}
	return s.store.ActiveSessions(ctx, lookback)
}
func (s *PersistenceService) Participants(ctx context.Context, roomID string) ([]Participant, error) {
	if s == nil || s.store == nil {
		return nil, nil
	}
	return s.store.Participants(ctx, roomID)
}
func (s *PersistenceService) RecordHistory(ctx context.Context, record HistoryRecord) error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.RecordHistory(ctx, record)
}

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
	if len(invitees) == 0 && chat.Type != domain.ChatTypeVoice && chat.Type != domain.ChatTypeGroup && chat.Type != domain.ChatTypeFamily {
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
