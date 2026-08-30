package http

import (
	"context"
	"encoding/json"
	"errors"
	stdhttp "net/http"
	"strings"
)

// AdminHTTPError preserves endpoint-specific status and detail contracts
// without coupling the HTTP adapter to a feature implementation.
type AdminHTTPError struct {
	Status int
	Detail string
}

func (e AdminHTTPError) Error() string { return e.Detail }

func adminError(w stdhttp.ResponseWriter, fallback int, fallbackDetail string, err error) {
	var mapped AdminHTTPError
	if errors.As(err, &mapped) {
		writeAdminPublicAccessDetail(w, mapped.Status, mapped.Detail)
		return
	}
	writeAdminPublicAccessDetail(w, fallback, fallbackDetail)
}

// AdminActor is the minimal authenticated identity the administration HTTP
// boundary needs. It deliberately contains no application or persistence type.
type AdminActor struct{ ID, FamilyID, Role string }

type DomainLinkPayload struct {
	Domain    string  `json:"domain"`
	APIDomain *string `json:"apiDomain"`
}

// AdminPublicAccessOperations supplies use-case calls to the HTTP adapter.
// The adapter owns request decoding, authorization responses and JSON output;
// composition supplies business operations and their persistence adapters.
type AdminPublicAccessOperations struct {
	IsAdmin            func(AdminActor) bool
	Get                func(context.Context, AdminActor) (any, error)
	Update             func(context.Context, AdminActor, *string, *string) (any, error)
	Suggestions        func(context.Context, AdminActor) (any, error)
	Check              func(context.Context, AdminActor) (any, error)
	GetEncryption      func(context.Context, AdminActor) (any, error)
	UpdateEncryption   func(context.Context, AdminActor, string) (any, error)
	TunnelStatus       func(context.Context, AdminActor) (any, error)
	TunnelStart        func(context.Context, AdminActor, string, bool) (any, error)
	TunnelStop         func(context.Context, AdminActor) (any, error)
	DomainLink         func(context.Context, AdminActor, DomainLinkPayload) (any, error)
	QuickStart         func(context.Context, AdminActor) (any, error)
	PublicIPQuickStart func(context.Context, AdminActor) (any, error)
}

type AdminPublicAccessHandler struct{ operations AdminPublicAccessOperations }

func NewAdminPublicAccessHandler(operations AdminPublicAccessOperations) AdminPublicAccessHandler {
	return AdminPublicAccessHandler{operations: operations}
}

func (h AdminPublicAccessHandler) allowed(w stdhttp.ResponseWriter, actor AdminActor) bool {
	if h.operations.IsAdmin == nil || !h.operations.IsAdmin(actor) {
		writeAdminPublicAccessDetail(w, stdhttp.StatusForbidden, "Admin access required")
		return false
	}
	return true
}

func (h AdminPublicAccessHandler) Get(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.Get(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusNotFound, "Family not found", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	var payload struct {
		AppURL *string `json:"appUrl"`
		APIURL *string `json:"apiUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	value, err := h.operations.Update(r.Context(), actor, payload.AppURL, payload.APIURL)
	if err != nil {
		adminError(w, stdhttp.StatusUnprocessableEntity, err.Error(), err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) Suggestions(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.Suggestions(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not load public access suggestions", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) Check(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.Check(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusNotFound, "Family not found", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) GetEncryption(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.GetEncryption(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusNotFound, "Family not found", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) UpdateEncryption(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	var payload struct {
		DefaultMessageEncryptionProtocol string `json:"defaultMessageEncryptionProtocol"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	value, err := h.operations.UpdateEncryption(r.Context(), actor, payload.DefaultMessageEncryptionProtocol)
	if err != nil {
		adminError(w, stdhttp.StatusUnprocessableEntity, err.Error(), err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) TunnelStatus(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.TunnelStatus(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusNotFound, "Family not found", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) TunnelStart(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	if provider == "" {
		provider = "cloudflare"
	}
	if provider != "cloudflare" && provider != "localtunnel" {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Unsupported tunnel provider")
		return
	}
	autoRestart := true
	if raw := strings.TrimSpace(r.URL.Query().Get("autoRestart")); raw != "" {
		autoRestart = raw != "false" && raw != "0"
	}
	value, err := h.operations.TunnelStart(r.Context(), actor, provider, autoRestart)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not start tunnel", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) DomainLink(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	var payload DomainLinkPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	value, err := h.operations.DomainLink(r.Context(), actor, payload)
	if err != nil {
		adminError(w, stdhttp.StatusUnprocessableEntity, err.Error(), err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) TunnelStop(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.TunnelStop(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not stop tunnel", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) QuickStart(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.QuickStart(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not start public access", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func (h AdminPublicAccessHandler) PublicIPQuickStart(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	value, err := h.operations.PublicIPQuickStart(r.Context(), actor)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not start public IP access", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, value)
}

func writeAdminPublicAccessJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeAdminPublicAccessDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeAdminPublicAccessJSON(w, status, map[string]string{"detail": detail})
}
