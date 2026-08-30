package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// LoginHandler owns the REST decoding and response contract for password
// login. Credential verification and session creation are supplied by the
// composition root through the narrow Authenticate operation.
type LoginHandler struct {
	Authenticate func(context.Context, string, string, string) (any, int, string)
	ClientIP     func(*stdhttp.Request) string
	WriteSuccess func(stdhttp.ResponseWriter, any)
}

func (h LoginHandler) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeLoginDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if h.Authenticate == nil {
		writeLoginDetail(w, stdhttp.StatusInternalServerError, "Login unavailable")
		return
	}
	ip := ""
	if h.ClientIP != nil {
		ip = h.ClientIP(r)
	}
	response, status, detail := h.Authenticate(r.Context(), strings.TrimSpace(request.Username), request.Password, ip)
	if status != 0 {
		writeLoginDetail(w, status, detail)
		return
	}
	if h.WriteSuccess != nil {
		h.WriteSuccess(w, response)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(stdhttp.StatusOK)
	_ = json.NewEncoder(w).Encode(response)
}

func writeLoginDetail(w stdhttp.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": detail})
}
