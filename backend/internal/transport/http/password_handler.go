package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// PasswordChangeHandler is the HTTP edge for changing a password. Session and
// credential policy are injected so this transport never imports identity or
// persistence packages.
type PasswordChangeHandler struct {
	RefreshCookieName string
	Change            func(context.Context, PasswordChangeRequest, string) (int, string, error)
}

type PasswordChangeRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h PasswordChangeHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request PasswordChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writePasswordDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	rawToken := ""
	if cookie, err := r.Cookie(h.RefreshCookieName); err == nil {
		rawToken = strings.TrimSpace(cookie.Value)
	}
	if rawToken == "" {
		rawToken = strings.TrimSpace(r.Header.Get("X-Refresh-Token"))
	}
	status, detail, err := h.Change(r.Context(), request, rawToken)
	if err != nil {
		writePasswordDetail(w, status, detail)
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}

func writePasswordDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
