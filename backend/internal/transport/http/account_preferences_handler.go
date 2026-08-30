package http

import (
	"encoding/json"
	"net/http"

	featurepreferences "stovo-messenger/backend/internal/features/preferences"
)

// AccountPreferencesHandler serves audio and notification preference endpoints.
type AccountPreferencesHandler struct {
	preferences *featurepreferences.Service
	appURL      string
	decodeJSON  func(*http.Request, any) error
}

func NewAccountPreferencesHandler(preferences *featurepreferences.Service, appURL string, decodeJSON func(*http.Request, any) error) *AccountPreferencesHandler {
	return &AccountPreferencesHandler{preferences: preferences, appURL: appURL, decodeJSON: decodeJSON}
}

func (h *AccountPreferencesHandler) HandleGetAudioSettings(w http.ResponseWriter, r *http.Request, userID string) {
	settings, err := h.preferences.AudioSettings(r.Context(), userID)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not load audio settings")
		return
	}
	accountPreferencesJSON(w, http.StatusOK, settings)
}

func (h *AccountPreferencesHandler) HandleGetNotificationTopic(w http.ResponseWriter, r *http.Request, userID string) {
	topic, err := h.preferences.NotificationTopic(r.Context(), userID)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not load notification topic")
		return
	}
	accountPreferencesJSON(w, http.StatusOK, map[string]string{
		"topic":       topic,
		"ntfyBaseUrl": h.appURL + "/ntfy",
	})
}

func (h *AccountPreferencesHandler) HandlePutAudioSettings(w http.ResponseWriter, r *http.Request, userID string) {
	var payload featurepreferences.AudioSettings
	decode := h.decodeJSON
	if decode == nil {
		decode = decodeBody
	}
	if err := decode(r, &payload); err != nil {
		accountPreferencesDetail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	settings, err := h.preferences.SaveAudioSettings(r.Context(), userID, payload)
	if err != nil {
		accountPreferencesDetail(w, http.StatusInternalServerError, "Could not save audio settings")
		return
	}
	accountPreferencesJSON(w, http.StatusOK, settings)
}

func accountPreferencesJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func accountPreferencesDetail(w http.ResponseWriter, status int, message string) {
	accountPreferencesJSON(w, status, map[string]string{"detail": message})
}

func decodeBody(r *http.Request, target any) error {
	return json.NewDecoder(r.Body).Decode(target)
}
