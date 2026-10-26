package chats

import (
	"context"
	"errors"
	"testing"
	"time"
)

type pinStoreFake struct {
	pin       Pin
	attempted Pin
	created   bool
}

func (s *pinStoreFake) ActiveMessageChatID(context.Context, string) (string, error) {
	return "chat", nil
}
func (s *pinStoreFake) TryPin(_ context.Context, pin Pin) (bool, error) {
	s.attempted = pin
	if s.created {
		s.pin = pin
	}
	return s.created, nil
}
func (s *pinStoreFake) Pin(context.Context, string, string) (Pin, error) { return s.pin, nil }
func (*pinStoreFake) DeletePin(context.Context, string, string) error    { return nil }
func (*pinStoreFake) ActivePins(context.Context, string) ([]Pin, error)  { return nil, nil }

func TestPinsServiceReturnsPersistedPinForRetries(t *testing.T) {
	store := &pinStoreFake{created: false, pin: Pin{ChatID: "chat", MessageID: "message", PinnedBy: "first"}}
	service := NewPinsService(store, func() time.Time { return time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC) })
	pin, created, err := service.Pin(context.Background(), "chat", "message", "second")
	if err != nil || created || pin.PinnedBy != "first" {
		t.Fatalf("pin=%+v created=%v err=%v", pin, created, err)
	}
}

type settingsStoreStub struct {
	chatID      string
	seconds     int
	updated     string
	visibility  string
	approvedBy  string
	preferences Preferences
	description *string
	avatar      AvatarChoices
	err         error
}

func (s *settingsStoreStub) UpdateCommentsEnabled(context.Context, string, bool, string) error {
	return s.err
}

func (s *settingsStoreStub) UpdatePinPermission(context.Context, string, string, string) error {
	return s.err
}

func (s *settingsStoreStub) UpdateTitle(context.Context, string, string, string) error {
	return s.err
}

func (s *settingsStoreStub) UpdateDescription(_ context.Context, chatID string, description *string, updatedAt string) error {
	s.chatID, s.description, s.updated = chatID, description, updatedAt
	return s.err
}

func (s *settingsStoreStub) UpdatePhoto(context.Context, string, *string, string) error {
	return s.err
}

func (s *settingsStoreStub) UpdateAvatarChoices(_ context.Context, chatID string, choices AvatarChoices, updatedAt string) error {
	s.chatID, s.avatar, s.updated = chatID, choices, updatedAt
	return s.err
}

func (s *settingsStoreStub) UpdatePreferences(_ context.Context, preferences Preferences) error {
	s.preferences = preferences
	return s.err
}

func (s *settingsStoreStub) UpdateMediaVisibility(_ context.Context, chatID, visibility, updatedAt string) error {
	s.chatID, s.visibility, s.updated = chatID, visibility, updatedAt
	return s.err
}

func (s *settingsStoreStub) ApproveDirectMediaVisibility(_ context.Context, chatID, userID, _, updatedAt string) error {
	s.chatID, s.approvedBy, s.updated = chatID, userID, updatedAt
	return s.err
}

func (s *settingsStoreStub) UpdateMessageDelay(_ context.Context, chatID string, seconds int, updatedAt string) (MessageDelay, error) {
	s.chatID, s.seconds, s.updated = chatID, seconds, updatedAt
	if s.err != nil {
		return MessageDelay{}, s.err
	}
	return MessageDelay{Seconds: seconds, UpdatedAt: updatedAt}, nil
}

func TestSettingsServicePersistsValidatedMessageDelay(t *testing.T) {
	store := &settingsStoreStub{}
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	updated, err := NewSettingsService(store, func() time.Time { return now }).SetMessageDelay(context.Background(), "chat", 5)
	if err != nil {
		t.Fatalf("SetMessageDelay() error = %v", err)
	}
	if store.chatID != "chat" || store.seconds != 5 || store.updated != now.Format(time.RFC3339Nano) || updated.Seconds != 5 {
		t.Fatalf("store = %#v, updated = %#v", store, updated)
	}
}

func TestSettingsServiceRejectsOutOfRangeMessageDelay(t *testing.T) {
	service := NewSettingsService(&settingsStoreStub{}, time.Now)
	for _, seconds := range []int{-1, 86401} {
		if _, err := service.SetMessageDelay(context.Background(), "chat", seconds); !errors.Is(err, ErrInvalidMessageDelay) {
			t.Fatalf("SetMessageDelay(%d) error = %v, want ErrInvalidMessageDelay", seconds, err)
		}
	}
}

func TestSettingsServiceValidatesCommentsAndPinPermission(t *testing.T) {
	service := NewSettingsService(&settingsStoreStub{}, time.Now)
	if err := service.SetCommentsEnabled(context.Background(), "group", "group", true); !errors.Is(err, ErrCommentsUnavailable) {
		t.Fatalf("SetCommentsEnabled() error = %v, want ErrCommentsUnavailable", err)
	}
	if err := service.SetPinPermission(context.Background(), "chat", "members"); !errors.Is(err, ErrInvalidPinPermission) {
		t.Fatalf("SetPinPermission() error = %v, want ErrInvalidPinPermission", err)
	}
}

func TestSettingsServicePersistsMediaVisibilityAndDirectApproval(t *testing.T) {
	store := &settingsStoreStub{}
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	service := NewSettingsService(store, func() time.Time { return now })
	if err := service.SetMediaVisibility(context.Background(), "chat", "family"); err != nil || store.visibility != "family" || store.updated != now.Format(time.RFC3339Nano) {
		t.Fatalf("store=%+v err=%v", store, err)
	}
	if err := service.ApproveDirectMediaVisibility(context.Background(), "chat", "user"); err != nil || store.approvedBy != "user" {
		t.Fatalf("store=%+v err=%v", store, err)
	}
}

func TestSettingsServiceDelegatesMemberPreferences(t *testing.T) {
	store := &settingsStoreStub{}
	service := NewSettingsService(store, time.Now)
	muted := true
	if err := service.UpdatePreferences(context.Background(), Preferences{ChatID: "chat", UserID: "user", IsMuted: &muted}); err != nil {
		t.Fatalf("UpdatePreferences() error = %v", err)
	}
	if store.preferences.ChatID != "chat" || store.preferences.UserID != "user" || store.preferences.IsMuted == nil || !*store.preferences.IsMuted {
		t.Fatalf("preferences=%+v", store.preferences)
	}
}

func TestSettingsServiceDelegatesNotificationPreferences(t *testing.T) {
	store := &settingsStoreStub{}
	service := NewSettingsService(store, time.Now)
	future := time.Now().Add(time.Hour)
	qEnabled := true
	qStart := "23:00"
	qEnd := "08:00"
	mode := "specific_senders"
	senders := []string{"u1", "u2"}
	mentions := true

	pref := Preferences{
		ChatID:               "chat",
		UserID:               "user",
		MutedUntil:           &future,
		QuietHoursEnabled:    &qEnabled,
		QuietHoursStart:      &qStart,
		QuietHoursEnd:        &qEnd,
		NotificationMode:     &mode,
		NotifySenderIDs:      &senders,
		AlwaysNotifyMentions: &mentions,
	}
	if err := service.UpdatePreferences(context.Background(), pref); err != nil {
		t.Fatalf("UpdatePreferences() error = %v", err)
	}
	if store.preferences.NotificationMode == nil || *store.preferences.NotificationMode != "specific_senders" {
		t.Fatalf("expected specific_senders, got %+v", store.preferences)
	}
	if store.preferences.NotifySenderIDs == nil || len(*store.preferences.NotifySenderIDs) != 2 {
		t.Fatalf("expected 2 senders, got %+v", store.preferences)
	}
}

func TestSettingsServiceDelegatesDescription(t *testing.T) {
	store := &settingsStoreStub{}
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	service := NewSettingsService(store, func() time.Time { return now })
	desc := "Atlas client rollout"
	if err := service.SetDescription(context.Background(), "chat-1", &desc); err != nil {
		t.Fatalf("SetDescription() error = %v", err)
	}
	if store.chatID != "chat-1" || store.description == nil || *store.description != desc || store.updated != now.Format(time.RFC3339Nano) {
		t.Fatalf("store=%+v", store)
	}
}

func TestSettingsServiceDelegatesAvatarChoices(t *testing.T) {
	store := &settingsStoreStub{}
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	service := NewSettingsService(store, func() time.Time { return now })
	mode, symbol, color := "symbol", "users", "purple"
	if err := service.SetAvatarChoices(context.Background(), "chat-1", AvatarChoices{Mode: &mode, SymbolID: &symbol, ColorID: &color}); err != nil {
		t.Fatalf("SetAvatarChoices() error = %v", err)
	}
	if store.chatID != "chat-1" || store.avatar.Mode == nil || *store.avatar.Mode != mode || store.avatar.SymbolID == nil || *store.avatar.SymbolID != symbol || store.avatar.ColorID == nil || *store.avatar.ColorID != color || store.updated != now.Format(time.RFC3339Nano) {
		t.Fatalf("store=%+v", store)
	}
}
