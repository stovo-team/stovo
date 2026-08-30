package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
)

// SetupStatus is the persistence-neutral installation state needed by the
// setup-status HTTP endpoint.
type SetupStatus struct {
	ActiveUserCount int
	FamilyName      *string
}

// SetupStatusOperations is the small application seam for the public setup
// status endpoint. NavTabs remains a callback because the deployment setting
// is an outer configuration concern, not identity feature state.
type SetupStatusOperations struct {
	Load     func(context.Context) (SetupStatus, error)
	NavTabs  func() any
	LogError func(operation string, err error)
}

// SetupStatusResponse is the stable setup-status wire representation.
type SetupStatusResponse struct {
	SetupRequired bool    `json:"setupRequired"`
	SetupComplete bool    `json:"setupComplete"`
	FamilyName    *string `json:"familyName,omitempty"`
	NavTabs       any     `json:"navTabs,omitempty"`
}

// SetupStatusHandler is the inbound HTTP adapter for GET /api/auth/setup-status.
type SetupStatusHandler struct{ operations SetupStatusOperations }

func NewSetupStatusHandler(operations SetupStatusOperations) SetupStatusHandler {
	return SetupStatusHandler{operations: operations}
}

func (h SetupStatusHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	status, err := h.operations.Load(r.Context())
	if err != nil {
		if h.operations.LogError != nil {
			h.operations.LogError("load setup status", err)
		}
		writeSetupStatusError(w, stdhttp.StatusInternalServerError, "Could not load setup status")
		return
	}
	required := status.ActiveUserCount == 0
	response := SetupStatusResponse{
		SetupRequired: required,
		SetupComplete: !required,
		FamilyName:    status.FamilyName,
	}
	if h.operations.NavTabs != nil {
		response.NavTabs = h.operations.NavTabs()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func writeSetupStatusError(w stdhttp.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": message})
}
