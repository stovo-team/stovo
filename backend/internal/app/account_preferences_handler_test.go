package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type accountPreferencesStoreFake struct {
	audioSettings *string
	audioErr      error
	topic         *string
	persisted     string
}

func (f *accountPreferencesStoreFake) AudioCallSettings(context.Context, string) (*string, error) {
	return f.audioSettings, f.audioErr
}

func (f *accountPreferencesStoreFake) SetAudioCallSettings(_ context.Context, _ string, settings string) error {
	f.persisted = settings
	return nil
}

func (f *accountPreferencesStoreFake) NtfyTopicToken(context.Context, string) (*string, error) {
	return f.topic, nil
}

func (f *accountPreferencesStoreFake) SetNtfyTopicToken(_ context.Context, _ string, topic string) error {
	f.persisted = topic
	return nil
}

func TestAccountPreferencesReturnsStoreFailureForAudioSettings(t *testing.T) {
	handler := NewAccountPreferencesHandler(&accountPreferencesStoreFake{audioErr: errors.New("database unavailable")}, "https://app.test", nil)
	recorder := httptest.NewRecorder()
	handler.handleGetAudioSettings(recorder, httptest.NewRequest(http.MethodGet, "/api/auth/audio-settings", nil), userPublic{ID: "user-1"})
	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}
}

func TestAccountPreferencesKeepsPrivacyWhenSavingAudioSettings(t *testing.T) {
	existing := `{"privacy":{"directMessagePermission":"nobody"}}`
	store := &accountPreferencesStoreFake{audioSettings: &existing}
	decoder := func(r *http.Request, target any) error { return json.NewDecoder(r.Body).Decode(target) }
	handler := NewAccountPreferencesHandler(store, "https://app.test", decoder)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/auth/audio-settings", strings.NewReader(`{"inputGain":999,"outputVolume":-1,"speakerMode":"invalid"}`))
	handler.handlePutAudioSettings(recorder, req, userPublic{ID: "user-1"})
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	var saved audioCallSettings
	if err := json.Unmarshal([]byte(store.persisted), &saved); err != nil {
		t.Fatalf("decode saved settings: %v", err)
	}
	if saved.InputGain != 200 || saved.OutputVolume != 0 || saved.SpeakerMode != "small" || saved.Privacy == nil || saved.Privacy.DirectMessagePermission != "nobody" {
		t.Fatalf("unexpected saved settings: %#v", saved)
	}
}

func TestAccountPreferencesReturnsExistingNotificationTopic(t *testing.T) {
	topic := "stovo-user-known"
	store := &accountPreferencesStoreFake{topic: &topic}
	handler := NewAccountPreferencesHandler(store, "https://app.test", nil)
	recorder := httptest.NewRecorder()
	handler.handleGetNotificationTopic(recorder, httptest.NewRequest(http.MethodGet, "/api/notifications/topic", nil), userPublic{ID: "user-1"})
	if recorder.Code != http.StatusOK || store.persisted != "" || !strings.Contains(recorder.Body.String(), topic) {
		t.Fatalf("unexpected topic response: status=%d persisted=%q body=%s", recorder.Code, store.persisted, recorder.Body.String())
	}
}
