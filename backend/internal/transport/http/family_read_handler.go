package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
)

// Family is the stable HTTP representation returned by GET /api/family.
// It deliberately contains no application, Ent, or configuration types.
type Family struct {
	ID                               string  `json:"id"`
	Name                             string  `json:"name"`
	StorageLimitMB                   *int64  `json:"storageLimitMb"`
	MinimizedChatLayout              bool    `json:"minimizedChatLayout"`
	DefaultMessageEncryptionProtocol string  `json:"defaultMessageEncryptionProtocol"`
	DefaultProfileVisibility         string  `json:"defaultProfileVisibility"`
	DefaultLastSeenVisibility        string  `json:"defaultLastSeenVisibility"`
	DefaultReadReceiptsEnabled       bool    `json:"defaultReadReceiptsEnabled"`
	DefaultNotificationSettings      string  `json:"defaultNotificationSettings"`
	ScreenShareBitrateKbps           int     `json:"screenShareBitrateKbps"`
	NavTabs                          NavTabs `json:"navTabs"`
}

// NavTabs is the family response's transport-owned navigation configuration.
type NavTabs struct {
	Chats    bool `json:"chats"`
	Storage  bool `json:"storage"`
	Plans    bool `json:"plans"`
	Settings bool `json:"settings"`
}

// FamilyReadOperations is the narrow seam used by the family read adapter.
// Loading and error classification stay in the composed application layer;
// HTTP status and JSON serialization remain at the transport edge.
type FamilyReadOperations struct {
	Load       func(context.Context, string) (Family, error)
	IsNotFound func(error) bool
	LogError   func(operation string, err error)
}

// FamilyReadHandler maps GET /api/family to the supplied read operation.
type FamilyReadHandler struct{ operations FamilyReadOperations }

func NewFamilyReadHandler(operations FamilyReadOperations) FamilyReadHandler {
	return FamilyReadHandler{operations: operations}
}

// GetFamily must receive the authenticated caller's family ID from the
// surrounding authentication adapter.
func (h FamilyReadHandler) GetFamily(w stdhttp.ResponseWriter, r *stdhttp.Request, familyID string) {
	family, err := h.operations.Load(r.Context(), familyID)
	if err != nil {
		if h.operations.IsNotFound != nil && h.operations.IsNotFound(err) {
			writeFamilyReadJSON(w, stdhttp.StatusNotFound, map[string]string{"detail": "Family not found"})
			return
		}
		if h.operations.LogError != nil {
			h.operations.LogError("load family", err)
		}
		writeFamilyReadJSON(w, stdhttp.StatusInternalServerError, map[string]string{"detail": "Could not load member defaults"})
		return
	}
	writeFamilyReadJSON(w, stdhttp.StatusOK, family)
}

func writeFamilyReadJSON(w stdhttp.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
