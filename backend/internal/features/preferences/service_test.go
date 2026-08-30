package preferences

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type storeFake struct {
	audio     *string
	audioErr  error
	topic     *string
	persisted string
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
