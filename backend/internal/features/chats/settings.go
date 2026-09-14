// Package chats contains chat-level application use cases.
package chats

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidMessageDelay  = errors.New("message delay must be between 0 and 86400 seconds")
	ErrCommentsUnavailable  = errors.New("comments can only be changed for channels")
	ErrInvalidPinPermission = errors.New("pin permission must be everyone or admins_only")
	ErrNotFound             = errors.New("chat resource not found")
)

type Pin struct {
	ChatID, MessageID, PinnedBy string
	PinnedAt                    time.Time
}

type PinStore interface {
	ActiveMessageChatID(context.Context, string) (string, error)
	TryPin(context.Context, Pin) (bool, error)
	Pin(context.Context, string, string) (Pin, error)
	DeletePin(context.Context, string, string) error
	ActivePins(context.Context, string) ([]Pin, error)
}

type PinsService struct {
	store PinStore
	now   Clock
}

func NewPinsService(store PinStore, now Clock) *PinsService {
	if now == nil {
		now = time.Now
	}
	return &PinsService{store: store, now: now}
}

func (s *PinsService) MessageChatID(ctx context.Context, messageID string) (string, error) {
	return s.store.ActiveMessageChatID(ctx, messageID)
}
func (s *PinsService) Pin(ctx context.Context, chatID, messageID, userID string) (Pin, bool, error) {
	pin := Pin{ChatID: chatID, MessageID: messageID, PinnedBy: userID, PinnedAt: s.now().UTC()}
	created, err := s.store.TryPin(ctx, pin)
	if err != nil || created {
		return pin, created, err
	}
	pin, err = s.store.Pin(ctx, chatID, messageID)
	return pin, false, err
}
func (s *PinsService) Get(ctx context.Context, chatID, messageID string) (Pin, error) {
	return s.store.Pin(ctx, chatID, messageID)
}
func (s *PinsService) Delete(ctx context.Context, chatID, messageID string) error {
	return s.store.DeletePin(ctx, chatID, messageID)
}
func (s *PinsService) List(ctx context.Context, chatID string) ([]Pin, error) {
	return s.store.ActivePins(ctx, chatID)
}

// SettingsStore is the chat feature's persistence boundary. It returns the
// committed values so callers do not need a second, potentially stale read.
type SettingsStore interface {
	UpdateMessageDelay(context.Context, string, int, string) (MessageDelay, error)
	UpdateCommentsEnabled(context.Context, string, bool, string) error
	UpdatePinPermission(context.Context, string, string, string) error
	UpdateTitle(context.Context, string, string, string) error
	UpdateDescription(context.Context, string, *string, string) error
	UpdatePhoto(context.Context, string, *string, string) error
	UpdateMediaVisibility(context.Context, string, string, string) error
	ApproveDirectMediaVisibility(context.Context, string, string, string, string) error
	UpdatePreferences(context.Context, Preferences) error
}

type MessageDelay struct {
	Seconds   int
	UpdatedAt string
}

// Preferences is the persistence-neutral partial update to a member's chat
// preferences. A nil field leaves the current value unchanged.
type Preferences struct {
	ChatID, UserID  string
	IsMuted         *bool
	IsPinned        *bool
	IsFavorite      *bool
	WallpaperFileID *string
	ClearWallpaper  bool
}

type Clock func() time.Time

type SettingsService struct {
	store SettingsStore
	now   Clock
}

func NewSettingsService(store SettingsStore, now Clock) *SettingsService {
	if now == nil {
		now = time.Now
	}
	return &SettingsService{store: store, now: now}
}

func (s *SettingsService) SetMessageDelay(ctx context.Context, chatID string, seconds int) (MessageDelay, error) {
	if seconds < 0 || seconds > 86400 {
		return MessageDelay{}, ErrInvalidMessageDelay
	}
	return s.store.UpdateMessageDelay(ctx, chatID, seconds, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) SetCommentsEnabled(ctx context.Context, chatID, chatType string, enabled bool) error {
	if err := ValidateCommentsChatType(chatType); err != nil {
		return err
	}
	return s.store.UpdateCommentsEnabled(ctx, chatID, enabled, s.now().UTC().Format(time.RFC3339Nano))
}

func ValidateCommentsChatType(chatType string) error {
	if chatType != "channel" {
		return ErrCommentsUnavailable
	}
	return nil
}

func (s *SettingsService) SetPinPermission(ctx context.Context, chatID, permission string) error {
	if permission != "everyone" && permission != "admins_only" {
		return ErrInvalidPinPermission
	}
	return s.store.UpdatePinPermission(ctx, chatID, permission, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) SetMediaVisibility(ctx context.Context, chatID, visibility string) error {
	if visibility != "family" && visibility != "members" {
		return errors.New("invalid media visibility")
	}
	return s.store.UpdateMediaVisibility(ctx, chatID, visibility, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) ApproveDirectMediaVisibility(ctx context.Context, chatID, userID string) error {
	now := s.now().UTC().Format(time.RFC3339Nano)
	return s.store.ApproveDirectMediaVisibility(ctx, chatID, userID, now, now)
}

func (s *SettingsService) SetTitle(ctx context.Context, chatID, title string) error {
	return s.store.UpdateTitle(ctx, chatID, title, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) SetDescription(ctx context.Context, chatID string, description *string) error {
	return s.store.UpdateDescription(ctx, chatID, description, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) SetPhoto(ctx context.Context, chatID string, photoFileID *string) error {
	return s.store.UpdatePhoto(ctx, chatID, photoFileID, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *SettingsService) UpdatePreferences(ctx context.Context, preferences Preferences) error {
	return s.store.UpdatePreferences(ctx, preferences)
}
