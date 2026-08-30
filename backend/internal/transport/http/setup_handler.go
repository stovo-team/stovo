package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"

	"stovo-messenger/backend/internal/features/identity"
)

// SetupRequest is the public installation request. It intentionally contains
// no persistence or framework model and is normalized at the HTTP boundary.
type SetupRequest struct {
	FamilyName  string `json:"familyName"`
	Nickname    string `json:"nickname"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	InviteToken string `json:"inviteToken"`
}

// SetupHandler owns decoding and wire validation for POST /api/auth/setup.
// Account provisioning is an injected application operation so this transport
// never depends on configuration, JWT encoding, or persistence.
type SetupHandler struct {
	Process      func(context.Context, SetupRequest, string) (value any, status int, detail string)
	ClientIP     func(*stdhttp.Request) string
	WriteSuccess func(stdhttp.ResponseWriter, int, any)
}

func (h SetupHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload SetupRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeSetupDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.InviteToken = strings.TrimSpace(payload.InviteToken)
	registration := identity.NormalizeRegistration(identity.Registration{FamilyName: payload.FamilyName, Nickname: payload.Nickname, Username: payload.Username, DisplayName: payload.DisplayName}, true)
	payload.FamilyName, payload.Nickname = registration.FamilyName, registration.Nickname
	payload.Username, payload.DisplayName = registration.Username, registration.DisplayName
	if payload.FamilyName == "" || payload.Username == "" || payload.DisplayName == "" || len(payload.Password) < 8 {
		writeSetupDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid setup payload")
		return
	}
	if h.Process == nil {
		writeSetupDetail(w, stdhttp.StatusInternalServerError, "Could not complete setup")
		return
	}
	ip := ""
	if h.ClientIP != nil {
		ip = h.ClientIP(r)
	}
	value, status, detail := h.Process(r.Context(), payload, ip)
	if detail != "" {
		writeSetupDetail(w, status, detail)
		return
	}
	if h.WriteSuccess != nil {
		h.WriteSuccess(w, status, value)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeSetupDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
