package http

import (
	"encoding/json"
	stdhttp "net/http"
)

// MeHandler serializes the established GET /api/auth/me representation. The
// authentication adapter supplies the already-authenticated public account so
// this transport does not depend on JWT, configuration, or application types.
type MeHandler struct{}

func NewMeHandler() MeHandler { return MeHandler{} }

// Write writes the current account using the stable status and JSON contract.
func (MeHandler) Write(w stdhttp.ResponseWriter, user any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(user)
}
