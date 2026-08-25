package app

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"

	"family-messenger/backend/internal/ports"

	"github.com/go-chi/chi/v5"
)

// privacyStore is the persistence boundary required by PrivacyHandler.
// Keeping it limited to block-list operations lets the HTTP adapter avoid a
// dependency on Server or the wider repository API.
type privacyStore = ports.PrivacyBlocklist

// PrivacyHandler serves authenticated privacy block-list routes.
type PrivacyHandler struct {
	store      privacyStore
	lookupUser func(string) (userPublic, error)
}

func NewPrivacyHandler(store privacyStore, lookupUser func(string) (userPublic, error)) *PrivacyHandler {
	return &PrivacyHandler{store: store, lookupUser: lookupUser}
}

func (s *Server) directContactBlocked(firstUserID, secondUserID string) (bool, error) {
	if s.contactPolicy == nil {
		return false, nil
	}
	return s.contactPolicy.DirectContactBlocked(context.Background(), firstUserID, secondUserID)
}

func contactPermissionAllows(target userPublic, inviterID, chatType string) bool {
	permission := target.DirectMessagePermission
	if chatType == "group" {
		permission = target.GroupInvitePermission
	}
	if chatType == "channel" {
		permission = target.ChannelInvitePermission
	}
	if chatType == "voice" {
		permission = target.VoiceInvitePermission
	}
	if chatType == "direct" {
		return permission != "nobody" && (permission != "selected" || slices.Contains(target.InvitePermissionUserIDs, inviterID))
	}
	return permission == "allow" || (permission == "selected" && slices.Contains(target.InvitePermissionUserIDs, inviterID))
}

func (h *PrivacyHandler) handleListBlocks(w http.ResponseWriter, r *http.Request, user userPublic) {
	ids, err := h.store.ListBlockedUserIDs(r.Context(), user.ID)
	if err != nil {
		privacyDetail(w, http.StatusInternalServerError, "Could not load blocked members")
		return
	}
	blocked := make([]userPublic, 0)
	for _, id := range ids {
		member, err := h.lookupUser(id)
		if err == nil {
			blocked = append(blocked, member)
		}
	}
	privacyJSON(w, http.StatusOK, blocked)
}

func (h *PrivacyHandler) handleBlockUser(w http.ResponseWriter, r *http.Request, user userPublic) {
	targetID := chi.URLParam(r, "userId")
	target, err := h.lookupUser(targetID)
	if err != nil || target.ID == user.ID || target.FamilyID != user.FamilyID || !target.IsActive {
		privacyDetail(w, http.StatusBadRequest, "Invalid family member")
		return
	}
	if err := h.store.BlockUser(r.Context(), user.ID, target.ID, nowString()); err != nil {
		privacyDetail(w, http.StatusInternalServerError, "Could not block member")
		return
	}
	privacyJSON(w, http.StatusOK, target)
}

func (h *PrivacyHandler) handleUnblockUser(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := h.store.UnblockUser(r.Context(), user.ID, chi.URLParam(r, "userId")); err != nil {
		privacyDetail(w, http.StatusInternalServerError, "Could not unblock member")
		return
	}
	privacyJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func privacyJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func privacyDetail(w http.ResponseWriter, status int, message string) {
	privacyJSON(w, status, map[string]string{"detail": message})
}
