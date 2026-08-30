package http

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	featureprivacy "stovo-messenger/backend/internal/features/privacy"
)

// PrivacyOperations describes the injected capabilities needed for privacy routes.
type PrivacyOperations[User any] struct {
	Privacy       *featureprivacy.Service
	LookupUser    func(ctx context.Context, id string) (User, error)
	ExtractMember func(user User) featureprivacy.Member
}

// PrivacyHandler serves authenticated privacy block-list HTTP endpoints.
type PrivacyHandler[User any] struct {
	ops PrivacyOperations[User]
}

func NewPrivacyHandler[User any](ops PrivacyOperations[User]) *PrivacyHandler[User] {
	return &PrivacyHandler[User]{ops: ops}
}

func (h *PrivacyHandler[User]) ListBlocks(user User) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		member := h.ops.ExtractMember(user)
		ids, err := h.ops.Privacy.ListBlocked(r.Context(), member.ID)
		if err != nil {
			privacyDetail(w, http.StatusInternalServerError, "Could not load blocked members")
			return
		}
		blocked := make([]User, 0, len(ids))
		for _, id := range ids {
			target, err := h.ops.LookupUser(r.Context(), id)
			if err == nil {
				blocked = append(blocked, target)
			}
		}
		privacyJSON(w, http.StatusOK, blocked)
	}
}

func (h *PrivacyHandler[User]) BlockUser(user User) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		targetID := chi.URLParam(r, "userId")
		target, err := h.ops.LookupUser(r.Context(), targetID)
		userMember := h.ops.ExtractMember(user)
		targetMember := h.ops.ExtractMember(target)
		if err != nil || targetMember.ID == userMember.ID || targetMember.FamilyID != userMember.FamilyID || !targetMember.Active {
			privacyDetail(w, http.StatusBadRequest, "Invalid family member")
			return
		}
		if err := h.ops.Privacy.Block(r.Context(), userMember, targetMember); err != nil {
			if errors.Is(err, featureprivacy.ErrInvalidMember) {
				privacyDetail(w, http.StatusBadRequest, "Invalid family member")
				return
			}
			privacyDetail(w, http.StatusInternalServerError, "Could not block member")
			return
		}
		privacyJSON(w, http.StatusOK, target)
	}
}

func (h *PrivacyHandler[User]) UnblockUser(user User) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userMember := h.ops.ExtractMember(user)
		targetID := chi.URLParam(r, "userId")
		if err := h.ops.Privacy.Unblock(r.Context(), userMember.ID, targetID); err != nil {
			privacyDetail(w, http.StatusInternalServerError, "Could not unblock member")
			return
		}
		privacyJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func privacyJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func privacyDetail(w http.ResponseWriter, status int, message string) {
	privacyJSON(w, status, map[string]string{"detail": message})
}
