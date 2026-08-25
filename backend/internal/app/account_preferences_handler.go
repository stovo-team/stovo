package app

import (
	"encoding/json"
	"net/http"
	"strings"

	"family-messenger/backend/internal/ports"

	"github.com/google/uuid"
)

// accountPreferencesStore is the persistence boundary for account preference routes.
type accountPreferencesStore = ports.AccountPreferences

// AccountPreferencesHandler serves the audio and notification preferences routes.
type AccountPreferencesHandler struct {
	store      accountPreferencesStore
	appURL     string
	decodeJSON func(*http.Request, any) error
}

func NewAccountPreferencesHandler(store accountPreferencesStore, appURL string, decodeJSON func(*http.Request, any) error) *AccountPreferencesHandler {
	return &AccountPreferencesHandler{store: store, appURL: appURL, decodeJSON: decodeJSON}
}

func (h *AccountPreferencesHandler) handleGetAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	raw, err := h.store.AudioCallSettings(r.Context(), user.ID)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not load audio settings")
		return
	}
	if raw == nil || strings.TrimSpace(*raw) == "" {
		accountPreferencesJSON(w, http.StatusOK, defaultAudioSettings())
		return
	}
	var settings audioCallSettings
	if json.Unmarshal([]byte(*raw), &settings) != nil {
		accountPreferencesJSON(w, http.StatusOK, defaultAudioSettings())
		return
	}
	accountPreferencesJSON(w, http.StatusOK, settings)
}

func (h *AccountPreferencesHandler) handleGetNotificationTopic(w http.ResponseWriter, r *http.Request, user userPublic) {
	token, err := h.store.NtfyTopicToken(r.Context(), user.ID)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not load notification topic")
		return
	}
	topic := ""
	if token != nil && *token != "" {
		topic = *token
	} else {
		topic = "stovo-user-" + uuid.NewString()
		if err := h.store.SetNtfyTopicToken(r.Context(), user.ID, topic); err != nil {
			accountPreferencesDetail(w, http.StatusInternalServerError, "Could not persist notification topic")
			return
		}
	}
	accountPreferencesJSON(w, http.StatusOK, map[string]string{
		"topic":       topic,
		"ntfyBaseUrl": h.appURL + "/ntfy",
	})
}

func (h *AccountPreferencesHandler) handlePutAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload updateAudioSettingsRequest
	if err := h.decodeJSON(r, &payload); err != nil {
		accountPreferencesDetail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	clampAudioSettings(&payload)
	if raw, err := h.store.AudioCallSettings(r.Context(), user.ID); err == nil && raw != nil {
		var existing audioCallSettings
		if json.Unmarshal([]byte(*raw), &existing) == nil {
			payload.Privacy = existing.Privacy
		}
	}
	blob, err := json.Marshal(payload)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not encode audio settings")
		return
	}
	if err := h.store.SetAudioCallSettings(r.Context(), user.ID, string(blob)); err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not save audio settings")
		return
	}
	accountPreferencesJSON(w, http.StatusOK, payload)
}

func clampAudioSettings(settings *audioCallSettings) {
	settings.InputGain = min(200, max(0, settings.InputGain))
	settings.OutputVolume = min(100, max(0, settings.OutputVolume))
	settings.VoiceEnhancementThreshold = min(0, max(-50, settings.VoiceEnhancementThreshold))
	settings.VoiceEnhancementHighpass = min(300, max(60, settings.VoiceEnhancementHighpass))
	if settings.SpeakerMode != "small" && settings.SpeakerMode != "large" {
		settings.SpeakerMode = "small"
	}
}

func accountPreferencesJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func accountPreferencesDetail(w http.ResponseWriter, status int, message string) {
	accountPreferencesJSON(w, status, map[string]string{"detail": message})
}
