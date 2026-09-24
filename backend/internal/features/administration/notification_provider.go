package administration

import (
	"context"
	"errors"
	"strings"
)

const (
	NotificationProviderFirebase = "firebase"
	NotificationProviderNtfy     = "ntfy"
)

var ErrUnsupportedNotificationProvider = errors.New("unsupported notification provider")

type NotificationProviderStore interface {
	NotificationProvider(context.Context) (string, error)
	SaveNotificationProvider(context.Context, string) error
}

type NotificationProviderService struct{ store NotificationProviderStore }

func NewNotificationProviderService(store NotificationProviderStore) *NotificationProviderService {
	return &NotificationProviderService{store: store}
}

func NormalizeNotificationProvider(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case NotificationProviderFirebase:
		return NotificationProviderFirebase, nil
	case NotificationProviderNtfy:
		return NotificationProviderNtfy, nil
	default:
		return "", ErrUnsupportedNotificationProvider
	}
}

func (s *NotificationProviderService) Get(ctx context.Context) (string, error) {
	provider, err := s.store.NotificationProvider(ctx)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(provider) == "" {
		return NotificationProviderFirebase, nil
	}
	return NormalizeNotificationProvider(provider)
}

func (s *NotificationProviderService) Set(ctx context.Context, value string) (string, error) {
	provider, err := NormalizeNotificationProvider(value)
	if err != nil {
		return "", err
	}
	if err := s.store.SaveNotificationProvider(ctx, provider); err != nil {
		return "", err
	}
	return provider, nil
}
