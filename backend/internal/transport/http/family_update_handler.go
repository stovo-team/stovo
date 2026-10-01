package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// FamilyUpdateRequest is the REST boundary payload for PATCH /api/family.
// It intentionally avoids app and persistence types.
type FamilyUpdateRequest struct {
	Name                            *string `json:"name"`
	StorageLimitMB                  *int64  `json:"storageLimitMb"`
	MinimizedChatLayout             *bool   `json:"minimizedChatLayout"`
	DefaultProfileVisibility        *string `json:"defaultProfileVisibility"`
	DefaultLastSeenVisibility       *string `json:"defaultLastSeenVisibility"`
	DefaultReadReceiptsEnabled      *bool   `json:"defaultReadReceiptsEnabled"`
	DefaultNotificationSettings     *string `json:"defaultNotificationSettings"`
	TranslationEnabled              *bool   `json:"translationEnabled"`
	CallRecordingEnabled            *bool   `json:"callRecordingEnabled"`
	AINotesEnabled                  *bool   `json:"aiNotesEnabled"`
	VoiceTranscriptionEnabled       *bool   `json:"voiceTranscriptionEnabled"`
	ScreenShareBitrateKbps          *int    `json:"screenShareBitrateKbps"`
	CameraBitrateKbps               *int    `json:"cameraBitrateKbps"`
	GroupCallScreenShareBitrateKbps *int    `json:"groupCallScreenShareBitrateKbps"`
	GroupCallCameraBitrateKbps      *int    `json:"groupCallCameraBitrateKbps"`
	DMCallScreenShareBitrateKbps    *int    `json:"dmCallScreenShareBitrateKbps"`
	DMCallCameraBitrateKbps         *int    `json:"dmCallCameraBitrateKbps"`
}

type FamilyUpdateActor struct {
	FamilyID    string
	Role        string
	Permissions []string
}

// FamilyUpdateOperations contains only use-case-facing callbacks supplied by
// composition. Authorization and HTTP decoding stay at this transport edge.
type FamilyUpdateOperations struct {
	IsAdmin                   func(FamilyUpdateActor) bool
	IsOwner                   func(FamilyUpdateActor) bool
	Update                    func(context.Context, string, FamilyUpdateRequest) (any, error)
	ValidVisibility           func(*string, *string) bool
	ValidNotificationSettings func(string) bool
}

type FamilyUpdateHandler struct{ operations FamilyUpdateOperations }

func NewFamilyUpdateHandler(operations FamilyUpdateOperations) FamilyUpdateHandler {
	return FamilyUpdateHandler{operations}
}

func (h FamilyUpdateHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request, actor FamilyUpdateActor) {
	if h.operations.IsAdmin == nil || !h.operations.IsAdmin(actor) {
		writeFamilyReadJSON(w, stdhttp.StatusForbidden, map[string]string{"detail": "Owner or admin access required"})
		return
	}
	var payload FamilyUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid request body"})
		return
	}
	if payload.Name != nil {
		value := strings.TrimSpace(*payload.Name)
		payload.Name = &value
		if value == "" {
			writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "name cannot be blank"})
			return
		}
	}
	if payload.StorageLimitMB != nil && *payload.StorageLimitMB <= 0 {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "storageLimitMb must be positive"})
		return
	}
	for name, value := range map[string]*int{
		"screenShareBitrateKbps":          payload.ScreenShareBitrateKbps,
		"cameraBitrateKbps":               payload.CameraBitrateKbps,
		"groupCallScreenShareBitrateKbps": payload.GroupCallScreenShareBitrateKbps,
		"groupCallCameraBitrateKbps":      payload.GroupCallCameraBitrateKbps,
		"dmCallScreenShareBitrateKbps":    payload.DMCallScreenShareBitrateKbps,
		"dmCallCameraBitrateKbps":         payload.DMCallCameraBitrateKbps,
	} {
		if value != nil && (*value < 1000 || *value > 20000) {
			writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": name + " must be between 1000 and 20000"})
			return
		}
	}
	hasDefaults := payload.DefaultProfileVisibility != nil || payload.DefaultLastSeenVisibility != nil || payload.DefaultReadReceiptsEnabled != nil || payload.DefaultNotificationSettings != nil
	hasCallQuality := payload.ScreenShareBitrateKbps != nil || payload.CameraBitrateKbps != nil || payload.GroupCallScreenShareBitrateKbps != nil || payload.GroupCallCameraBitrateKbps != nil || payload.DMCallScreenShareBitrateKbps != nil || payload.DMCallCameraBitrateKbps != nil
	if (hasDefaults || hasCallQuality) && (h.operations.IsOwner == nil || !h.operations.IsOwner(actor)) {
		writeFamilyReadJSON(w, stdhttp.StatusForbidden, map[string]string{"detail": "Only the server owner can update member defaults"})
		return
	}
	if h.operations.ValidVisibility != nil && !h.operations.ValidVisibility(payload.DefaultProfileVisibility, payload.DefaultLastSeenVisibility) {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "privacy visibility must be everyone or nobody"})
		return
	}
	if payload.DefaultNotificationSettings != nil && h.operations.ValidNotificationSettings != nil && !h.operations.ValidNotificationSettings(*payload.DefaultNotificationSettings) {
		writeFamilyReadJSON(w, stdhttp.StatusUnprocessableEntity, map[string]string{"detail": "Invalid notification defaults"})
		return
	}
	family, err := h.operations.Update(r.Context(), actor.FamilyID, payload)
	if err != nil {
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Could not update family"})
		return
	}
	writeFamilyReadJSON(w, stdhttp.StatusOK, family)
}
