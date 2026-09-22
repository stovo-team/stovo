package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"
	"strings"
)

// DeviceLoginHandler owns the request/response contract for the passwordless
// device-login flow. Code delivery and session creation remain feature/runtime
// operations supplied during composition.
type DeviceLoginHandler struct {
	Request      func(context.Context, string, string) (any, int, string)
	Verify       func(context.Context, string, string, string) (any, int, string)
	ClientIP     func(*stdhttp.Request) string
	WriteSuccess func(stdhttp.ResponseWriter, *stdhttp.Request, any)
}

func (h DeviceLoginHandler) RequestCode(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request struct {
		Username string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeDeviceLoginDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	username := strings.TrimSpace(request.Username)
	if username == "" {
		writeDeviceLoginDetail(w, stdhttp.StatusUnprocessableEntity, "Username is required")
		return
	}
	if h.Request == nil {
		writeDeviceLoginDetail(w, stdhttp.StatusInternalServerError, "Device login unavailable")
		return
	}
	ip := ""
	if h.ClientIP != nil {
		ip = h.ClientIP(r)
	}
	response, status, detail := h.Request(r.Context(), username, ip)
	if status != 0 {
		writeDeviceLoginDetail(w, status, detail)
		return
	}
	writeDeviceLoginJSON(w, stdhttp.StatusAccepted, response)
}

func (h DeviceLoginHandler) VerifyCode(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var request struct {
		Username string `json:"username"`
		Code     string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeDeviceLoginDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if h.Verify == nil {
		writeDeviceLoginDetail(w, stdhttp.StatusInternalServerError, "Device login unavailable")
		return
	}
	ip := ""
	if h.ClientIP != nil {
		ip = h.ClientIP(r)
	}
	response, status, detail := h.Verify(r.Context(), strings.TrimSpace(request.Username), request.Code, ip)
	if status != 0 {
		writeDeviceLoginDetail(w, status, detail)
		return
	}
	if h.WriteSuccess != nil {
		h.WriteSuccess(w, r, response)
		return
	}
	writeDeviceLoginJSON(w, stdhttp.StatusOK, response)
}

func writeDeviceLoginJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeDeviceLoginDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeDeviceLoginJSON(w, status, map[string]string{"detail": detail})
}
