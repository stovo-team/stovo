package administration

import (
	"context"
	"errors"
	"testing"
)

type notificationProviderStoreFake struct {
	value string
	err   error
}

func (s *notificationProviderStoreFake) NotificationProvider(context.Context) (string, error) {
	return s.value, s.err
}
func (s *notificationProviderStoreFake) SaveNotificationProvider(_ context.Context, provider string) error {
	s.value = provider
	return s.err
}

func TestNotificationProviderDefaultsToFirebaseWhenMissing(t *testing.T) {
	got, err := NewNotificationProviderService(&notificationProviderStoreFake{}).Get(context.Background())
	if err != nil || got != NotificationProviderFirebase {
		t.Fatalf("Get() = %q, %v; want firebase", got, err)
	}
}

func TestNotificationProviderSetPersistsAllowedProvider(t *testing.T) {
	store := &notificationProviderStoreFake{}
	service := NewNotificationProviderService(store)
	got, err := service.Set(context.Background(), NotificationProviderNtfy)
	if err != nil || got != NotificationProviderNtfy || store.value != NotificationProviderNtfy {
		t.Fatalf("Set() = %q, %v; persisted %q", got, err, store.value)
	}
}

func TestNotificationProviderRejectsUnknownProviderWithoutSaving(t *testing.T) {
	store := &notificationProviderStoreFake{value: NotificationProviderFirebase}
	for _, invalid := range []string{"smtp", ""} {
		if _, err := NewNotificationProviderService(store).Set(context.Background(), invalid); !errors.Is(err, ErrUnsupportedNotificationProvider) {
			t.Fatalf("Set(%q) error = %v; want unsupported provider", invalid, err)
		}
	}
	if store.value != NotificationProviderFirebase {
		t.Fatalf("invalid provider changed persisted value to %q", store.value)
	}
}

func TestNotificationProviderStorageFailureIsReturned(t *testing.T) {
	want := errors.New("database unavailable")
	store := &notificationProviderStoreFake{err: want}
	if _, err := NewNotificationProviderService(store).Get(context.Background()); !errors.Is(err, want) {
		t.Fatalf("Get() error = %v; want %v", err, want)
	}
}
