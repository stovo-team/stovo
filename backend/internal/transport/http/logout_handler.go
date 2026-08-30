package http

import (
	"context"
	stdhttp "net/http"
	"strings"
)

// LogoutOperations supplies the session mutation and cookie policy from
// composition. Token extraction and the stable HTTP response remain at the
// HTTP boundary.
type LogoutOperations struct {
	RefreshCookieName string
	Revoke            func(context.Context, string) error
	ClearCookie       func(stdhttp.ResponseWriter)
}

type LogoutHandler struct{ operations LogoutOperations }

func NewLogoutHandler(operations LogoutOperations) LogoutHandler {
	return LogoutHandler{operations: operations}
}

func (h LogoutHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	rawToken := ""
	if cookie, err := r.Cookie(h.operations.RefreshCookieName); err == nil {
		rawToken = strings.TrimSpace(cookie.Value)
	}
	if rawToken == "" {
		rawToken = strings.TrimSpace(r.Header.Get("X-Refresh-Token"))
	}
	if rawToken != "" && h.operations.Revoke != nil {
		_ = h.operations.Revoke(r.Context(), rawToken)
	}
	if h.operations.ClearCookie != nil {
		h.operations.ClearCookie(w)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
