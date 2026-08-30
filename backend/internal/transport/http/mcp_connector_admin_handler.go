package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"github.com/go-chi/chi/v5"
)

type MCPConnectorCreatePayload struct {
	Name               string          `json:"name"`
	Provider           string          `json:"provider"`
	Alias              string          `json:"alias"`
	AuthMode           string          `json:"authMode"`
	AllowedChatIDs     []string        `json:"allowedChatIds"`
	Permissions        map[string]bool `json:"permissions"`
	MaxHistoryMessages *int            `json:"maxHistoryMessages"`
}

type MCPConnectorUpdatePayload struct {
	Name               *string         `json:"name"`
	Alias              *string         `json:"alias"`
	AuthMode           *string         `json:"authMode"`
	AllowedChatIDs     *[]string       `json:"allowedChatIds"`
	Permissions        map[string]bool `json:"permissions"`
	MaxHistoryMessages *int            `json:"maxHistoryMessages"`
	Enabled            *bool           `json:"enabled"`
}

type MCPConnectorAdminOperations struct {
	IsAdmin         func(AdminActor) bool
	Create          func(context.Context, AdminActor, MCPConnectorCreatePayload, *stdhttp.Request) (any, error)
	Update          func(context.Context, AdminActor, string, MCPConnectorUpdatePayload) (any, error)
	RegenerateToken func(context.Context, AdminActor, string, *stdhttp.Request) (any, error)
	Revoke          func(context.Context, AdminActor, string) (any, error)
	ListAudit       func(context.Context, AdminActor, string) (any, error)
}

type MCPConnectorAdminHandler struct {
	operations MCPConnectorAdminOperations
}

func NewMCPConnectorAdminHandler(operations MCPConnectorAdminOperations) MCPConnectorAdminHandler {
	return MCPConnectorAdminHandler{operations: operations}
}

func (h MCPConnectorAdminHandler) allowed(w stdhttp.ResponseWriter, actor AdminActor) bool {
	if h.operations.IsAdmin == nil || !h.operations.IsAdmin(actor) {
		writeAdminPublicAccessDetail(w, stdhttp.StatusForbidden, "Admin access required")
		return false
	}
	return true
}

func (h MCPConnectorAdminHandler) Create(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	var payload MCPConnectorCreatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	result, err := h.operations.Create(r.Context(), actor, payload, r)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not create MCP connector", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusCreated, result)
}

func (h MCPConnectorAdminHandler) Update(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	connectorID := chi.URLParam(r, "connectorId")
	var payload MCPConnectorUpdatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeAdminPublicAccessDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	result, err := h.operations.Update(r.Context(), actor, connectorID, payload)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not update MCP connector", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, result)
}

func (h MCPConnectorAdminHandler) RegenerateToken(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	connectorID := chi.URLParam(r, "connectorId")
	result, err := h.operations.RegenerateToken(r.Context(), actor, connectorID, r)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not regenerate token", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, result)
}

func (h MCPConnectorAdminHandler) Revoke(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	connectorID := chi.URLParam(r, "connectorId")
	result, err := h.operations.Revoke(r.Context(), actor, connectorID)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not revoke connector", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, result)
}

func (h MCPConnectorAdminHandler) ListAudit(w stdhttp.ResponseWriter, r *stdhttp.Request, actor AdminActor) {
	if !h.allowed(w, actor) {
		return
	}
	connectorID := chi.URLParam(r, "connectorId")
	events, err := h.operations.ListAudit(r.Context(), actor, connectorID)
	if err != nil {
		adminError(w, stdhttp.StatusInternalServerError, "Could not load audit events", err)
		return
	}
	writeAdminPublicAccessJSON(w, stdhttp.StatusOK, events)
}
