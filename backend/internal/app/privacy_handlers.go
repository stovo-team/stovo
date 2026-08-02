package app

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) directContactBlocked(firstUserID, secondUserID string) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var count int
	err := s.queryRow(`SELECT COUNT(*) FROM user_blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?)`, firstUserID, secondUserID, secondUserID, firstUserID).Scan(&count)
	return count > 0, err
}

func (s *Server) handleListBlocks(w http.ResponseWriter, _ *http.Request, user userPublic) {
	rows, err := s.query(`SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = ? ORDER BY created_at DESC`, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load blocked members")
		return
	}
	defer rows.Close()
	blocked := make([]userPublic, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load blocked members")
			return
		}
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
	if _, err := s.exec(`INSERT INTO user_blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`, user.ID, target.ID, nowString()); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not block member")
		return
	}
	s.json(w, http.StatusOK, target)
}

func (s *Server) handleUnblockUser(w http.ResponseWriter, r *http.Request, user userPublic) {
	if _, err := s.exec(`DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`, user.ID, chi.URLParam(r, "userId")); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not unblock member")
		return
	}
	s.json(w, http.StatusOK, map[string]string{"status": "ok"})
}
