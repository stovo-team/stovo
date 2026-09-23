package app

import (
	"context"
	"testing"

	featureadministration "stovo-messenger/backend/internal/features/administration"
	"stovo-messenger/backend/internal/ports"
)

type notificationDestinationStore struct{ fcm, ntfy string }

func (s notificationDestinationStore) ListChatMemberUserIDs(context.Context, string) ([]string, error) {
	return nil, nil
}
func (s notificationDestinationStore) NtfyTopicToken(context.Context, string) (*string, error) {
	return &s.ntfy, nil
}
func (s notificationDestinationStore) FCMDeviceToken(context.Context, string) (*string, error) {
	return &s.fcm, nil
}
func (s notificationDestinationStore) GetChatNotificationPreferences(context.Context, string, []string) (map[string]ports.ChatNotificationPreference, error) {
	return nil, nil
}

func TestNotificationDeliveryRouteHonorsSelectedProvider(t *testing.T) {
	tests := []struct {
		name, provider, want string
		configured           bool
	}{
		{name: "firebase when configured", provider: featureadministration.NotificationProviderFirebase, configured: true, want: featureadministration.NotificationProviderFirebase},
		{name: "skip when firebase is unconfigured", provider: featureadministration.NotificationProviderFirebase, want: ""},
		{name: "ntfy even when firebase is configured", provider: featureadministration.NotificationProviderNtfy, configured: true, want: featureadministration.NotificationProviderNtfy},
		{name: "ntfy when firebase is unconfigured", provider: featureadministration.NotificationProviderNtfy, want: featureadministration.NotificationProviderNtfy},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := notificationDeliveryRoute(test.provider, test.configured); got != test.want {
				t.Fatalf("route = %q, want %q", got, test.want)
			}
		})
	}
}

func TestNotificationDestinationUsesIdentityForSelectedProvider(t *testing.T) {
	server := &Server{notificationRecipients: notificationDestinationStore{fcm: "fcm-device-token", ntfy: "stovo-user-topic"}}
	for _, test := range []struct{ provider, want string }{
		{provider: featureadministration.NotificationProviderFirebase, want: "fcm-device-token"},
		{provider: featureadministration.NotificationProviderNtfy, want: "stovo-user-topic"},
	} {
		got, err := server.getUserNotificationDestination(context.Background(), "user", test.provider)
		if err != nil || got != test.want {
			t.Fatalf("provider %s destination = %q, %v; want %q", test.provider, got, err, test.want)
		}
	}
}
