// Package preferences contains account-preference use cases.
package preferences

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

var (
	ErrTopicGeneration                = errors.New("generate notification topic")
	ErrInvalidDirectMessagePermission = errors.New("direct message permission is invalid")
	ErrInvalidInvitePermission        = errors.New("invite permission is invalid")
)

// Store is the persistence boundary consumed by account-preference use cases.
// It deliberately exposes persisted values rather than Ent models.
type Store interface {
	AudioCallSettings(context.Context, string) (*string, error)
	SetAudioCallSettings(context.Context, string, string) error
	NtfyTopicToken(context.Context, string) (*string, error)
	SetNtfyTopicToken(context.Context, string, string) error
}

// AudioSettings is the persisted, user-controlled call preference set.
type AudioSettings struct {
	SpeakerMode               string          `json:"speakerMode"`
	InputDeviceID             string          `json:"inputDeviceId"`
	OutputDeviceID            string          `json:"outputDeviceId"`
	EchoCancellation          bool            `json:"echoCancellation"`
	NoiseSuppression          bool            `json:"noiseSuppression"`
	AutoGainControl           bool            `json:"autoGainControl"`
	VoiceEnhancement          bool            `json:"voiceEnhancement"`
	InputGain                 float64         `json:"inputGain"`
	OutputVolume              float64         `json:"outputVolume"`
	VoiceEnhancementThreshold float64         `json:"voiceEnhancementThreshold"`
	VoiceEnhancementHighpass  float64         `json:"voiceEnhancementHighpass"`
	Privacy                   *ContactPrivacy `json:"privacy,omitempty"`
}

type ContactPrivacy struct {
	DirectMessagePermission string   `json:"directMessagePermission"`
	GroupInvitePermission   string   `json:"groupInvitePermission"`
	ChannelInvitePermission string   `json:"channelInvitePermission"`
	VoiceInvitePermission   string   `json:"voiceInvitePermission"`
	InvitePermissionUserIDs []string `json:"invitePermissionUserIds"`
}

type ContactPrivacyPatch struct {
	DirectMessagePermission *string
	GroupInvitePermission   *string
	ChannelInvitePermission *string
	VoiceInvitePermission   *string
	InvitePermissionUserIDs *[]string
}

// TopicGenerator is supplied by bootstrap so the feature has no dependency on
// UUID libraries, configuration, or a randomness provider.
type TopicGenerator func() string

type Service struct {
	store    Store
	newTopic TopicGenerator
}

func NewService(store Store, newTopic TopicGenerator) *Service {
	return &Service{store: store, newTopic: newTopic}
}

func (s *Service) AudioSettings(ctx context.Context, userID string) (AudioSettings, error) {
	raw, err := s.store.AudioCallSettings(ctx, userID)
	if err != nil {
		return AudioSettings{}, err
	}
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return DefaultAudioSettings(), nil
	}
	var settings AudioSettings
	if json.Unmarshal([]byte(*raw), &settings) != nil {
		return DefaultAudioSettings(), nil
	}
	return settings, nil
}

func (s *Service) SaveAudioSettings(ctx context.Context, userID string, settings AudioSettings) (AudioSettings, error) {
	// Privacy is managed by the profile endpoint. A call-settings update must
	// retain it exactly as the legacy API did.
	if raw, err := s.store.AudioCallSettings(ctx, userID); err == nil && raw != nil {
		var existing AudioSettings
		if json.Unmarshal([]byte(*raw), &existing) == nil {
			settings.Privacy = existing.Privacy
		}
	}
	ClampAudioSettings(&settings)
	raw, err := json.Marshal(settings)
	if err != nil {
		return AudioSettings{}, err
	}
	if err := s.store.SetAudioCallSettings(ctx, userID, string(raw)); err != nil {
		return AudioSettings{}, err
	}
	return settings, nil
}

func (s *Service) NotificationTopic(ctx context.Context, userID string) (string, error) {
	topic, err := s.store.NtfyTopicToken(ctx, userID)
	if err != nil {
		return "", err
	}
	if topic != nil && *topic != "" {
		return *topic, nil
	}
	if s.newTopic == nil {
		return "", ErrTopicGeneration
	}
	generated := strings.TrimSpace(s.newTopic())
	if generated == "" {
		return "", ErrTopicGeneration
	}
	if err := s.store.SetNtfyTopicToken(ctx, userID, generated); err != nil {
		return "", err
	}
	return generated, nil
}

// SaveContactPrivacy updates only account-contact controls, preserving every
// other persisted audio setting. It preserves the legacy fallback defaults
// when a historic settings value is absent or malformed.
func (s *Service) SaveContactPrivacy(ctx context.Context, userID string, patch ContactPrivacyPatch) error {
	if err := ValidateContactPrivacyPatch(patch); err != nil {
		return err
	}
	if patch.DirectMessagePermission == nil && patch.GroupInvitePermission == nil && patch.ChannelInvitePermission == nil && patch.VoiceInvitePermission == nil && patch.InvitePermissionUserIDs == nil {
		return nil
	}
	raw, err := s.store.AudioCallSettings(ctx, userID)
	if err != nil {
		return err
	}
	settings := legacyPrivacyFallbackSettings()
	if raw != nil {
		_ = json.Unmarshal([]byte(*raw), &settings)
	}
	privacy := ContactPrivacy{DirectMessagePermission: "family", GroupInvitePermission: "allow", ChannelInvitePermission: "allow", VoiceInvitePermission: "allow"}
	if settings.Privacy != nil {
		privacy = *settings.Privacy
	}
	if patch.DirectMessagePermission != nil {
		privacy.DirectMessagePermission = *patch.DirectMessagePermission
	}
	if patch.GroupInvitePermission != nil {
		privacy.GroupInvitePermission = *patch.GroupInvitePermission
	}
	if patch.ChannelInvitePermission != nil {
		privacy.ChannelInvitePermission = *patch.ChannelInvitePermission
	}
	if patch.VoiceInvitePermission != nil {
		privacy.VoiceInvitePermission = *patch.VoiceInvitePermission
	}
	if patch.InvitePermissionUserIDs != nil {
		privacy.InvitePermissionUserIDs = *patch.InvitePermissionUserIDs
	}
	settings.Privacy = &privacy
	encoded, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return s.store.SetAudioCallSettings(ctx, userID, string(encoded))
}

func ValidateContactPrivacyPatch(patch ContactPrivacyPatch) error {
	if patch.DirectMessagePermission != nil && *patch.DirectMessagePermission != "family" && *patch.DirectMessagePermission != "selected" && *patch.DirectMessagePermission != "nobody" {
		return ErrInvalidDirectMessagePermission
	}
	for _, value := range []*string{patch.GroupInvitePermission, patch.ChannelInvitePermission, patch.VoiceInvitePermission} {
		if value != nil && *value != "allow" && *value != "selected" && *value != "request" && *value != "nobody" {
			return ErrInvalidInvitePermission
		}
	}
	return nil
}

func legacyPrivacyFallbackSettings() AudioSettings {
	return AudioSettings{SpeakerMode: "small", EchoCancellation: true, NoiseSuppression: true, AutoGainControl: true, VoiceEnhancement: true, InputGain: 100, OutputVolume: 80, VoiceEnhancementThreshold: -24, VoiceEnhancementHighpass: 120}
}

// ValidDefaultNotificationSettings checks the persisted family-wide quiet-hour
// configuration without coupling the feature to an HTTP request type.
func ValidDefaultNotificationSettings(raw string) bool {
	var settings struct {
		QuietHoursStart string `json:"quietHoursStart"`
		QuietHoursEnd   string `json:"quietHoursEnd"`
	}
	if json.Unmarshal([]byte(raw), &settings) != nil {
		return false
	}
	for _, value := range []string{settings.QuietHoursStart, settings.QuietHoursEnd} {
		if _, err := time.Parse("15:04", value); err != nil {
			return false
		}
	}
	return true
}

func DefaultAudioSettings() AudioSettings {
	return AudioSettings{
		SpeakerMode:               "small",
		EchoCancellation:          true,
		NoiseSuppression:          true,
		AutoGainControl:           true,
		VoiceEnhancement:          true,
		VoiceEnhancementThreshold: -35,
		VoiceEnhancementHighpass:  80,
	}
}

func ClampAudioSettings(settings *AudioSettings) {
	settings.InputGain = min(200, max(0, settings.InputGain))
	settings.OutputVolume = min(100, max(0, settings.OutputVolume))
	settings.VoiceEnhancementThreshold = min(0, max(-50, settings.VoiceEnhancementThreshold))
	settings.VoiceEnhancementHighpass = min(300, max(60, settings.VoiceEnhancementHighpass))
	if settings.SpeakerMode != "small" && settings.SpeakerMode != "large" {
		settings.SpeakerMode = "small"
	}
}
