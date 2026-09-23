package preferences

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type storeFake struct {
	audio        *string
	audioErr     error
	topic        *string
	persisted    string
	fcmToken     *string
	persistedFCM string
}

func (f *storeFake) AudioCallSettings(context.Context, string) (*string, error) {
	return f.audio, f.audioErr
}
func (f *storeFake) SetAudioCallSettings(_ context.Context, _ string, value string) error {
	f.persisted = value
	return nil
}
func (f *storeFake) NtfyTopicToken(context.Context, string) (*string, error) { return f.topic, nil }
func (f *storeFake) SetNtfyTopicToken(_ context.Context, _ string, value string) error {
	f.persisted = value
	if value == "" {
		f.topic = nil
	} else {
		f.topic = &value
	}
	return nil
}
func (f *storeFake) FCMDeviceToken(context.Context, string) (*string, error) { return f.fcmToken, nil }
func (f *storeFake) SetFCMDeviceToken(_ context.Context, _ string, value string) error {
	f.persistedFCM = value
	if value == "" {
		f.fcmToken = nil
	} else {
		f.fcmToken = &value
	}
	return nil
}

func TestAudioSettingsUsesDefaultsForMissingOrMalformedData(t *testing.T) {
	for _, raw := range []*string{nil, pointer("not-json")} {
		settings, err := NewService(&storeFake{audio: raw}, nil).AudioSettings(context.Background(), "user")
		if err != nil || settings.SpeakerMode != "small" || !settings.EchoCancellation {
			t.Fatalf("settings = %#v, err = %v", settings, err)
		}
	}
}

func TestAudioSettingsPreservesLegacyPartialPayloadSemantics(t *testing.T) {
	raw := `{"privacy":{"directMessagePermission":"nobody"}}`
	settings, err := NewService(&storeFake{audio: &raw}, nil).AudioSettings(context.Background(), "user")
	if err != nil {
		t.Fatalf("audio settings: %v", err)
	}
	if settings.SpeakerMode != "" || settings.EchoCancellation || settings.Privacy == nil || settings.Privacy.DirectMessagePermission != "nobody" {
		t.Fatalf("settings no longer match the persisted partial payload: %#v", settings)
	}
}

func TestSaveAudioSettingsClampsValuesAndRetainsPrivacy(t *testing.T) {
	existing := `{"privacy":{"directMessagePermission":"nobody"}}`
	store := &storeFake{audio: &existing}
	settings, err := NewService(store, nil).SaveAudioSettings(context.Background(), "user", AudioSettings{InputGain: 999, OutputVolume: -1, SpeakerMode: "invalid"})
	if err != nil {
		t.Fatalf("save audio settings: %v", err)
	}
	if settings.InputGain != 200 || settings.OutputVolume != 0 || settings.SpeakerMode != "small" || settings.Privacy == nil || settings.Privacy.DirectMessagePermission != "nobody" {
		t.Fatalf("unexpected settings: %#v", settings)
	}
}

func TestNotificationTopicReturnsExistingOrPersistsGeneratedValue(t *testing.T) {
	existing := "stovo-user-existing"
	topic, err := NewService(&storeFake{topic: &existing}, func() string { return "unexpected" }).NotificationTopic(context.Background(), "user")
	if err != nil || topic != existing {
		t.Fatalf("existing topic = %q, err = %v", topic, err)
	}
	store := &storeFake{}
	topic, err = NewService(store, func() string { return "stovo-user-new" }).NotificationTopic(context.Background(), "user")
	if err != nil || topic != "stovo-user-new" || store.persisted != topic {
		t.Fatalf("generated topic = %q, persisted = %q, err = %v", topic, store.persisted, err)
	}
}

func TestNotificationTopicRejectsMissingGenerator(t *testing.T) {
	_, err := NewService(&storeFake{}, nil).NotificationTopic(context.Background(), "user")
	if !errors.Is(err, ErrTopicGeneration) || strings.TrimSpace(err.Error()) == "" {
		t.Fatalf("err = %v", err)
	}
}

func TestRegisterPushDeviceTokenPreservesIndependentNtfyTopic(t *testing.T) {
	topic := "stovo-user-topic"
	store := &storeFake{topic: &topic}
	if err := NewService(store, nil).RegisterPushDeviceToken(context.Background(), "user", " fcm-device-token "); err != nil {
		t.Fatalf("register FCM token: %v", err)
	}
	if store.persistedFCM != "fcm-device-token" || store.topic == nil || *store.topic != topic {
		t.Fatalf("registration changed identities: fcm=%q ntfy=%v", store.persistedFCM, store.topic)
	}
}

func TestUnregisterPushDeviceTokenPreservesIndependentNtfyTopic(t *testing.T) {
	topic := "stovo-user-topic"
	fcmToken := "fcm-device-token"
	store := &storeFake{topic: &topic, fcmToken: &fcmToken}
	if err := NewService(store, nil).UnregisterPushDeviceToken(context.Background(), "user"); err != nil {
		t.Fatalf("unregister FCM token: %v", err)
	}
	if store.fcmToken != nil || store.topic == nil || *store.topic != topic {
		t.Fatalf("unregister changed identities: fcm=%v ntfy=%v", store.fcmToken, store.topic)
	}
}

func TestNotificationTopicCreationPreservesRegisteredFCMDeviceToken(t *testing.T) {
	fcmToken := "fcm-device-token"
	store := &storeFake{fcmToken: &fcmToken}
	topic, err := NewService(store, func() string { return "stovo-user-topic" }).NotificationTopic(context.Background(), "user")
	if err != nil || topic != "stovo-user-topic" {
		t.Fatalf("NotificationTopic() = %q, %v", topic, err)
	}
	if store.fcmToken == nil || *store.fcmToken != fcmToken || store.persistedFCM != "" {
		t.Fatalf("topic creation changed FCM identity: token=%v persisted=%q", store.fcmToken, store.persistedFCM)
	}
}

func TestSaveContactPrivacyPreservesSettingsAndValidates(t *testing.T) {
	raw := `{"speakerMode":"large","privacy":{"directMessagePermission":"family"}}`
	store := &storeFake{audio: &raw}
	permission := "nobody"
	if err := NewService(store, nil).SaveContactPrivacy(context.Background(), "user", ContactPrivacyPatch{DirectMessagePermission: &permission}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(store.persisted, `"speakerMode":"large"`) || !strings.Contains(store.persisted, `"directMessagePermission":"nobody"`) {
		t.Fatalf("persisted = %s", store.persisted)
	}
	invalid := "invalid"
	if err := ValidateContactPrivacyPatch(ContactPrivacyPatch{DirectMessagePermission: &invalid}); !errors.Is(err, ErrInvalidDirectMessagePermission) {
		t.Fatalf("error = %v", err)
	}
}

func TestValidDefaultNotificationSettings(t *testing.T) {
	if !ValidDefaultNotificationSettings(`{"quietHoursStart":"22:00","quietHoursEnd":"07:00"}`) {
		t.Fatal("valid settings rejected")
	}
	if ValidDefaultNotificationSettings(`{"quietHoursStart":"25:00","quietHoursEnd":"07:00"}`) {
		t.Fatal("invalid settings accepted")
	}
}

func pointer(value string) *string { return &value }
