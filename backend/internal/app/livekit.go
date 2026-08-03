package app

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

// liveKitClaims matches LiveKit's access token shape so the SFU accepts our JWTs
// without pulling in the full livekit/protocol module.
type liveKitClaims struct {
	Video *liveKitVideoGrant `json:"video,omitempty"`
	Name  string             `json:"name,omitempty"`
	jwt.RegisteredClaims
}

type liveKitVideoGrant struct {
	RoomJoin bool   `json:"roomJoin"`
	Room     string `json:"room"`
}

func (s *Server) mintLiveKitToken(roomName, identity, name string) (string, error) {
	now := time.Now()
	claims := liveKitClaims{
		Name: name,
		Video: &liveKitVideoGrant{
			RoomJoin: true,
			Room:     roomName,
		},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.LiveKitAPIKey,
			Subject:   identity,
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			ExpiresAt: jwt.NewNumericDate(now.Add(2 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.LiveKitAPISecret))
}

func (s *Server) handleCreateCallSFUToken(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := strings.TrimSpace(chi.URLParam(r, "roomId"))
	if roomID == "" {
		s.detail(w, http.StatusBadRequest, "roomId required")
		return
	}
	if strings.TrimSpace(s.cfg.LiveKitURL) == "" || strings.TrimSpace(s.cfg.LiveKitAPIKey) == "" || strings.TrimSpace(s.cfg.LiveKitAPISecret) == "" {
		s.detail(w, http.StatusServiceUnavailable, "SFU is not configured")
		return
	}
	session, ok := s.getCallSessionByRoom(roomID)
	if !ok || !isCallParticipant(session, user.ID) {
		s.detail(w, http.StatusForbidden, "Call not available")
		return
	}
	if session.Topology != callTopologySFU {
		promoted, err := s.promoteCallToSFU(session)
		if err != nil {
			s.detail(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		if !promoted && session.Topology != callTopologySFU {
			s.detail(w, http.StatusConflict, "Call is still in mesh mode")
			return
		}
	}
	token, err := s.mintLiveKitToken(session.ID, user.ID, user.DisplayName)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not mint SFU token")
		return
	}
	s.json(w, http.StatusOK, map[string]any{
		"token":    token,
		"url":      s.cfg.LiveKitURL,
		"roomName": session.ID,
		"roomId":   session.ID,
		"chatId":   session.ChatID,
	})
}
