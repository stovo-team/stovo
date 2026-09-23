package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// RefreshOperations supplies session rotation and cookie policy from the
// composition root. The accepted cookie/header inputs and HTTP errors are
// owned here at the HTTP boundary.
type RefreshOperations struct {
	RefreshCookieName string
	Rotate            func(context.Context, string, string) (any, int, string)
	ClientIP          func(*stdhttp.Request) string
	ClearCookie       func(stdhttp.ResponseWriter, *stdhttp.Request)
	WriteSuccess      func(stdhttp.ResponseWriter, *stdhttp.Request, any)
}

type RefreshHandler struct{ operations RefreshOperations }

func NewRefreshHandler(operations RefreshOperations) RefreshHandler {
	return RefreshHandler{operations: operations}
}

func (h RefreshHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	rawToken := ""
	if cookie, err := r.Cookie(h.operations.RefreshCookieName); err == nil {
		rawToken = strings.TrimSpace(cookie.Value)
	}
	if rawToken == "" {
		rawToken = strings.TrimSpace(r.Header.Get("X-Refresh-Token"))
	}
	if rawToken == "" {
		writeRefreshDetail(w, stdhttp.StatusUnauthorized, "Refresh token is missing")
		return
	}
	if h.operations.Rotate == nil {
		writeRefreshDetail(w, stdhttp.StatusInternalServerError, "Refresh unavailable")
		return
	}
	clientIP := ""
	if h.operations.ClientIP != nil {
		clientIP = h.operations.ClientIP(r)
	}
	response, status, detail := h.operations.Rotate(r.Context(), rawToken, clientIP)
	if status != 0 {
		if status == stdhttp.StatusUnauthorized && h.operations.ClearCookie != nil {
			h.operations.ClearCookie(w, r)
		}
		writeRefreshDetail(w, status, detail)
		return
	}
	if h.operations.WriteSuccess != nil {
		h.operations.WriteSuccess(w, r, response)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func writeRefreshDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
