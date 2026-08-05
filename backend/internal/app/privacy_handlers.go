package app

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) directContactBlocked(firstUserID, secondUserID string) (bool, error) {
	if s.store == nil {
		return false, nil
	}
	return s.store.DirectContactBlocked(context.Background(), firstUserID, secondUserID)
}

func (s *Server) handleListBlocks(w http.ResponseWriter, r *http.Request, user userPublic) {
	ids, err := s.store.ListBlockedUserIDs(r.Context(), user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load blocked members")
		return
	}
	blocked := make([]userPublic, 0)
	for _, id := range ids {
		member, err := s.getUserByID(id)
		if err == nil {
			blocked = append(blocked, member)
		}
	}
	s.json(w, http.StatusOK, blocked)
}

func (s *Server) handleBlockUser(w http.ResponseWriter, r *http.Request, user userPublic) {
	targetID := chi.URLParam(r, "userId")
	target, err := s.getUserByID(targetID)
	if err != nil || target.ID == user.ID || target.FamilyID != user.FamilyID || !target.IsActive {
		s.detail(w, http.StatusBadRequest, "Invalid family member")
		return
	}
	if err := s.store.BlockUser(r.Context(), user.ID, target.ID, nowString()); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not block member")
		return
	}
	s.json(w, http.StatusOK, target)
}

func (s *Server) handleUnblockUser(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.store.UnblockUser(r.Context(), user.ID, chi.URLParam(r, "userId")); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not unblock member")
		return
	}
	s.json(w, http.StatusOK, map[string]string{"status": "ok"})
}
