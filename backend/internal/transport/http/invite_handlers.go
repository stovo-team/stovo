package http

import (
	"context"
	"encoding/json"
	stdhttp "net/http"

	"stovo-messenger/backend/internal/features/identity"

	"github.com/go-chi/chi/v5"
)

// InviteCreateRequest is the REST body payload for POST /api/invites.
type InviteCreateRequest struct {
	Role           string `json:"role"`
	ExpiresInHours *int   `json:"expiresInHours"`
	MaxUses        *int   `json:"maxUses"`
}

// InviteCreateResponse is the wire format returned upon invite creation.
type InviteCreateResponse struct {
	InviteURL string `json:"inviteUrl"`
	Invite    any    `json:"invite"`
}

// InviteAcceptRequest is the REST body payload for POST /api/invites/{token}/accept.
type InviteAcceptRequest struct {
	Nickname    string `json:"nickname"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

// InviteCreateHandler owns request decoding, settings validation, and response writing for invite creation.
type InviteCreateHandler struct {
	IsAdmin     func() bool
	IsValidRole func(string) bool
	Create      func(context.Context, InviteCreateRequest) (any, int, string, error)
}

func (h InviteCreateHandler) CreateInvite(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.IsAdmin != nil && !h.IsAdmin() {
		writeInviteDetail(w, stdhttp.StatusForbidden, "Owner or admin access required")
		return
	}
	var payload InviteCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeInviteDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	role := payload.Role
	if role == "" {
		role = "member"
		payload.Role = role
	}
	if (h.IsValidRole != nil && !h.IsValidRole(role)) || role == "owner" {
		writeInviteDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid role")
		return
	}
	expiresHours := 48
	if payload.ExpiresInHours != nil {
		expiresHours = *payload.ExpiresInHours
	}
	maxUses := 1
	if payload.MaxUses != nil {
		maxUses = *payload.MaxUses
	}
	if expiresHours < 1 || expiresHours > 720 || maxUses < 1 || maxUses > 100 {
		writeInviteDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid invite settings")
		return
	}

	if h.Create == nil {
		writeInviteDetail(w, stdhttp.StatusInternalServerError, "Could not create invite")
		return
	}
	res, status, detail, err := h.Create(r.Context(), payload)
	if err != nil || status != 0 {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		if detail == "" {
			detail = "Could not create invite"
		}
		writeInviteDetail(w, status, detail)
		return
	}
	writeInviteJSON(w, stdhttp.StatusCreated, res)
}

// InviteAcceptHandler owns request decoding, payload normalization/validation, and response writing for accepting invitations.
type InviteAcceptHandler struct {
	ClientIP     func(*stdhttp.Request) string
	Accept       func(ctx context.Context, token string, payload InviteAcceptRequest, clientIP string) (any, int, string, error)
	WriteSuccess func(stdhttp.ResponseWriter, int, any)
}

func (h InviteAcceptHandler) AcceptInvite(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	var payload InviteAcceptRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeInviteDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	registration := identity.NormalizeRegistration(identity.Registration{
		Nickname:    payload.Nickname,
		Username:    payload.Username,
		DisplayName: payload.DisplayName,
	}, false)
	payload.Nickname, payload.Username, payload.DisplayName = registration.Nickname, registration.Username, registration.DisplayName
	if payload.Username == "" || payload.DisplayName == "" || len(payload.Password) < 8 {
		writeInviteDetail(w, stdhttp.StatusUnprocessableEntity, "Invalid invite acceptance payload")
		return
	}
	token := chi.URLParam(r, "token")
	clientIP := ""
	if h.ClientIP != nil {
		clientIP = h.ClientIP(r)
	}
	if h.Accept == nil {
		writeInviteDetail(w, stdhttp.StatusInternalServerError, "Could not accept invite")
		return
	}
	res, status, detail, err := h.Accept(r.Context(), token, payload, clientIP)
	if err != nil || status != 0 {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		if detail == "" {
			detail = "Could not accept invite"
		}
		writeInviteDetail(w, status, detail)
		return
	}
	if h.WriteSuccess != nil {
		h.WriteSuccess(w, stdhttp.StatusCreated, res)
		return
	}
	writeInviteJSON(w, stdhttp.StatusCreated, res)
}

// InviteDeleteHandler owns URL parameter extraction and response writing for revoking invitations.
type InviteDeleteHandler struct {
	IsAdmin func() bool
	Revoke  func(context.Context, string) (int, string, error)
}

func (h InviteDeleteHandler) DeleteInvite(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if h.IsAdmin != nil && !h.IsAdmin() {
		writeInviteDetail(w, stdhttp.StatusForbidden, "Owner or admin access required")
		return
	}
	inviteID := chi.URLParam(r, "inviteId")
	if h.Revoke == nil {
		writeInviteDetail(w, stdhttp.StatusInternalServerError, "Could not revoke invite")
		return
	}
	status, detail, err := h.Revoke(r.Context(), inviteID)
	if err != nil || status != 0 {
		if status == 0 {
			status = stdhttp.StatusInternalServerError
		}
		if detail == "" {
			detail = "Could not revoke invite"
		}
		writeInviteDetail(w, status, detail)
		return
	}
	w.WriteHeader(stdhttp.StatusNoContent)
}

func writeInviteJSON(w stdhttp.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeInviteDetail(w stdhttp.ResponseWriter, status int, detail string) {
	writeInviteJSON(w, status, map[string]string{"detail": detail})
}
