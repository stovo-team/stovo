package app

import (
	"net/http"

	featurepreferences "stovo-messenger/backend/internal/features/preferences"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

// AccountPreferencesHandler serves the audio and notification preferences routes.
type AccountPreferencesHandler struct {
	inner *httptransport.AccountPreferencesHandler
}

func NewAccountPreferencesHandler(preferences *featurepreferences.Service, appURL string, decodeJSON func(*http.Request, any) error) *AccountPreferencesHandler {
	return &AccountPreferencesHandler{inner: httptransport.NewAccountPreferencesHandler(preferences, appURL, decodeJSON)}
}

func (h *AccountPreferencesHandler) handleGetAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	h.inner.HandleGetAudioSettings(w, r, user.ID)
}

func (h *AccountPreferencesHandler) handleGetNotificationTopic(w http.ResponseWriter, r *http.Request, user userPublic) {
	h.inner.HandleGetNotificationTopic(w, r, user.ID)
}

func (h *AccountPreferencesHandler) handlePutAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	h.inner.HandlePutAudioSettings(w, r, user.ID)
}
