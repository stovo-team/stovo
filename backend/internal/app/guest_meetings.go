package app

// Guest meetings deliberately use a small, isolated persistence model instead
// of the authenticated call coordinator.  A guest never receives a chat ID,
// member JWT, socket credential, or family resource permission.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"stovo-messenger/backend/internal/adapters/livekit"
)

const guestMeetingCookie = "stovo_guest_meeting_session"
const guestMeetingLimit = 10

type guestMeeting struct {
	ID, ChatID, CreatorID, Title, AdmissionMode string
	ExpiresAt                                   time.Time
	ScheduledAt, RevokedAt, EndedAt             *time.Time
}
type guestMeetingSession struct{ ID, DisplayName, State string }

func (s *Server) guestMeetingRoutes() http.Handler {
	r := chi.NewRouter()
	r.Post("/", s.authenticated(s.createGuestMeeting))
	r.Get("/{meetingID}", s.authenticated(s.getGuestMeetingHostState))
	r.Post("/{meetingID}/host-token", s.authenticated(s.createGuestMeetingHostToken))
	r.Post("/{meetingID}/sessions/{sessionID}/admit", s.authenticated(s.admitGuestMeetingSession))
	r.Post("/{meetingID}/sessions/{sessionID}/remove", s.authenticated(s.removeGuestMeetingSession))
	r.Post("/{meetingID}/revoke", s.authenticated(s.revokeGuestMeeting))
	r.Get("/public/{token}", s.previewGuestMeeting)
	r.Post("/public/{token}/sessions", s.createGuestMeetingSession)
	r.Post("/public/{token}/leave", s.leaveGuestMeetingSession)
	r.Get("/public/{token}/status", s.guestMeetingStatus)
	r.Post("/public/{token}/token", s.createGuestMeetingGuestToken)
	r.Get("/public/{token}/intelligence", s.guestMeetingIntelligenceStatus)
	r.Post("/public/{token}/captions/translate", s.guestMeetingTranslateCaptions)
	return r
}

func (s *Server) guestMeetingsAvailable() bool {
	return s.guestDB != nil && s.cfg.GuestMeetingsEnabled && s.isSFUConfigured()
}
func guestMeetingTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func guestLiveKitIdentity(meetingID, displayName string) string {
	normalizedName := strings.ToLower(strings.TrimSpace(displayName))
	sum := sha256.Sum256([]byte(meetingID + "\x00" + normalizedName))
	return "guest:" + base64.RawURLEncoding.EncodeToString(sum[:18])
}
func randomGuestToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (s *Server) createGuestMeeting(w http.ResponseWriter, r *http.Request, user userPublic) {
	if !s.guestMeetingsAvailable() {
		s.json(w, http.StatusServiceUnavailable, map[string]string{"message": "Guest meetings require LiveKit and are disabled or unavailable"})
		return
	}
	if !hasPermission(user, permissionManageCalls) {
		s.json(w, http.StatusForbidden, map[string]string{"message": "Guest link permission required"})
		return
	}
	var body struct {
		ChatID        string `json:"chatId"`
		Title         string `json:"title"`
		ScheduledAt   string `json:"scheduledAt"`
		AdmissionMode string `json:"admissionMode"`
		ExpiresAt     string `json:"expiresAt"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || strings.TrimSpace(body.ChatID) == "" {
		s.json(w, 400, map[string]string{"message": "chatId is required"})
		return
	}
	title := strings.TrimSpace(body.Title)
	if len([]rune(title)) == 0 || len([]rune(title)) > 120 {
		s.json(w, 400, map[string]string{"message": "Meeting name must be 1 to 120 characters"})
		return
	}
	chat, err := s.buildChatPublic(body.ChatID, user)
	if err != nil || (chat.Type != "group" && chat.Type != "voice") {
		s.json(w, 403, map[string]string{"message": "Guest meetings are available only in group and voice chats"})
		return
	}
	mode := body.AdmissionMode
	if mode == "" {
		mode = "immediate"
	}
	if mode != "immediate" && mode != "lobby" {
		s.json(w, 400, map[string]string{"message": "admissionMode must be immediate or lobby"})
		return
	}
	expires := time.Now().UTC().Add(24 * time.Hour)
	if body.ExpiresAt != "" {
		parsed, e := time.Parse(time.RFC3339, body.ExpiresAt)
		if e != nil || !parsed.After(time.Now().UTC()) {
			s.json(w, 400, map[string]string{"message": "expiresAt must be a future date"})
			return
		}
		expires = parsed.UTC()
	}
	var scheduledAt *time.Time
	if body.ScheduledAt != "" {
		parsed, e := time.Parse(time.RFC3339, body.ScheduledAt)
		if e != nil {
			s.json(w, 400, map[string]string{"message": "scheduledAt must be an ISO 8601 date"})
			return
		}
		value := parsed.UTC()
		scheduledAt = &value
	}
	token, err := randomGuestToken()
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not create meeting link"})
		return
	}
	id := uuid.NewString()
	_, err = s.guestDB.ExecContext(r.Context(), `INSERT INTO guest_meetings (id,chat_id,creator_id,title,token_hash,admission_mode,expires_at,scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, chat.ID, user.ID, title, guestMeetingTokenHash(token), mode, expires, scheduledAt)
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not save guest meeting"})
		return
	}
	s.json(w, http.StatusCreated, map[string]any{"id": id, "chatId": chat.ID, "title": title, "scheduledAt": scheduledAt, "admissionMode": mode, "expiresAt": expires, "guestLimit": guestMeetingLimit, "meetingUrl": s.cfg.GuestMeetingURL + "/meet/" + token})
}

func (s *Server) meetingForHost(ctx context.Context, id, userID string) (guestMeeting, error) {
	var m guestMeeting
	err := s.guestDB.QueryRowContext(ctx, `SELECT id,chat_id,creator_id,title,admission_mode,expires_at,scheduled_at,revoked_at,ended_at FROM guest_meetings WHERE id=$1 AND creator_id=$2`, id, userID).Scan(&m.ID, &m.ChatID, &m.CreatorID, &m.Title, &m.AdmissionMode, &m.ExpiresAt, &m.ScheduledAt, &m.RevokedAt, &m.EndedAt)
	return m, err
}
func (s *Server) getGuestMeetingHostState(w http.ResponseWriter, r *http.Request, user userPublic) {
	m, err := s.meetingForHost(r.Context(), chi.URLParam(r, "meetingID"), user.ID)
	if err != nil {
		s.json(w, 404, map[string]string{"message": "Meeting not found"})
		return
	}
	rows, err := s.guestDB.QueryContext(r.Context(), `SELECT id,display_name,state FROM guest_meeting_sessions WHERE meeting_id=$1 AND state IN ('waiting','admitted') ORDER BY created_at`, m.ID)
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not load guests"})
		return
	}
	defer rows.Close()
	guests := []guestMeetingSession{}
	for rows.Next() {
		var g guestMeetingSession
		_ = rows.Scan(&g.ID, &g.DisplayName, &g.State)
		guests = append(guests, g)
	}
	s.json(w, 200, map[string]any{"id": m.ID, "chatId": m.ChatID, "title": m.Title, "scheduledAt": m.ScheduledAt, "admissionMode": m.AdmissionMode, "expiresAt": m.ExpiresAt, "revokedAt": m.RevokedAt, "endedAt": m.EndedAt, "guests": guests, "guestLimit": guestMeetingLimit})
}
func (s *Server) createGuestMeetingHostToken(w http.ResponseWriter, r *http.Request, user userPublic) {
	m, err := s.meetingForHost(r.Context(), chi.URLParam(r, "meetingID"), user.ID)
	if err != nil || m.RevokedAt != nil || time.Now().After(m.ExpiresAt) {
		s.json(w, 403, map[string]string{"message": "Meeting is unavailable"})
		return
	}
	token, err := livekit.TokenIssuer{URL: s.cfg.LiveKitURL, APIKey: s.cfg.LiveKitAPIKey, APISecret: s.cfg.LiveKitAPISecret}.MintWithTTL("guest-meeting:"+m.ID, "member:"+user.ID, user.DisplayName, 15*time.Minute)
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not mint meeting token"})
		return
	}
	s.json(w, 200, map[string]string{"url": s.cfg.LiveKitURL, "token": token, "roomName": "guest-meeting:" + m.ID})
}
func (s *Server) updateGuestSession(w http.ResponseWriter, r *http.Request, user userPublic, state string) {
	m, err := s.meetingForHost(r.Context(), chi.URLParam(r, "meetingID"), user.ID)
	if err != nil {
		s.json(w, 404, map[string]string{"message": "Meeting not found"})
		return
	}
	q := `UPDATE guest_meeting_sessions SET state=$1, admitted_at=CASE WHEN $1='admitted' THEN now() ELSE admitted_at END, blocked_at=CASE WHEN $1='blocked' THEN now() ELSE blocked_at END WHERE id=$2 AND meeting_id=$3`
	res, err := s.guestDB.ExecContext(r.Context(), q, state, chi.URLParam(r, "sessionID"), m.ID)
	n, _ := res.RowsAffected()
	if err != nil || n == 0 {
		s.json(w, 404, map[string]string{"message": "Guest not found"})
		return
	}
	s.json(w, 200, map[string]string{"state": state})
}
func (s *Server) admitGuestMeetingSession(w http.ResponseWriter, r *http.Request, user userPublic) {
	s.updateGuestSession(w, r, user, "admitted")
}
func (s *Server) removeGuestMeetingSession(w http.ResponseWriter, r *http.Request, user userPublic) {
	s.updateGuestSession(w, r, user, "blocked")
}
func (s *Server) revokeGuestMeeting(w http.ResponseWriter, r *http.Request, user userPublic) {
	m, err := s.meetingForHost(r.Context(), chi.URLParam(r, "meetingID"), user.ID)
	if err != nil {
		s.json(w, 404, map[string]string{"message": "Meeting not found"})
		return
	}
	_, err = s.guestDB.ExecContext(r.Context(), `UPDATE guest_meetings SET revoked_at=now(),ended_at=now() WHERE id=$1`, m.ID)
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not revoke meeting"})
		return
	}
	roomID := "guest-meeting:" + m.ID
	go func() {
		_, _, _ = s.stopGuestMeetingTranscription(context.Background(), roomID, m.ChatID, "", "meeting_ended")
		if s.guestDB != nil {
			_, _ = s.guestDB.ExecContext(context.Background(), `UPDATE call_recordings SET status='stopping', stopped_at=now(), updated_at=now() WHERE call_id=$1 AND status='recording'`, roomID)
		}
	}()
	s.json(w, 204, nil)
}

func (s *Server) publicMeeting(ctx context.Context, token string) (guestMeeting, error) {
	var m guestMeeting
	err := s.guestDB.QueryRowContext(ctx, `SELECT id,chat_id,creator_id,title,admission_mode,expires_at,scheduled_at,revoked_at,ended_at FROM guest_meetings WHERE token_hash=$1`, guestMeetingTokenHash(token)).Scan(&m.ID, &m.ChatID, &m.CreatorID, &m.Title, &m.AdmissionMode, &m.ExpiresAt, &m.ScheduledAt, &m.RevokedAt, &m.EndedAt)
	return m, err
}
func (s *Server) validPublicMeeting(ctx context.Context, token string) (guestMeeting, bool) {
	m, e := s.publicMeeting(ctx, token)
	return m, e == nil && m.RevokedAt == nil && m.EndedAt == nil && time.Now().Before(m.ExpiresAt)
}

// publicMeetingUnavailable reports expiration separately because expiry is an
// expected lifecycle state for a guest link, not an application failure.
func (s *Server) publicMeetingUnavailable(ctx context.Context, token string) (expired bool) {
	m, err := s.publicMeeting(ctx, token)
	return err == nil && m.RevokedAt == nil && m.EndedAt == nil && !time.Now().Before(m.ExpiresAt)
}

func (s *Server) writePublicMeetingUnavailable(w http.ResponseWriter, r *http.Request) {
	if s.publicMeetingUnavailable(r.Context(), chi.URLParam(r, "token")) {
		s.json(w, http.StatusGone, map[string]string{"code": "meeting_expired", "message": "This meeting link has expired. Ask the host for a new link."})
		return
	}
	s.json(w, http.StatusNotFound, map[string]string{"code": "meeting_unavailable", "message": "Meeting link is unavailable"})
}

func (s *Server) previewGuestMeeting(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	// A session row records admission, not real-time presence. It can outlive a
	// closed browser or a failed LiveKit connection, so never present it as a
	// live attendee count on a public link.
	guestCount := 0
	quality := defaultFamilyCallMediaQuality()
	if host, err := s.getUserByID(m.CreatorID); err == nil {
		if configured, err := s.callMediaQualityForFamily(r.Context(), host.FamilyID); err == nil {
			quality = configured
		}
	}
	s.json(w, 200, map[string]any{"title": m.Title, "scheduledAt": m.ScheduledAt, "admissionMode": m.AdmissionMode, "expiresAt": m.ExpiresAt, "guestCount": guestCount, "guestLimit": guestMeetingLimit, "screenShareBitrateKbps": quality.ScreenShareBitrateKbps, "cameraBitrateKbps": quality.CameraBitrateKbps})
}
func (s *Server) createGuestMeetingSession(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	var body struct {
		DisplayName string `json:"displayName"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || len([]rune(strings.TrimSpace(body.DisplayName))) < 2 || len([]rune(body.DisplayName)) > 80 {
		s.json(w, 400, map[string]string{"message": "Display name must be 2 to 80 characters"})
		return
	}
	displayName := strings.TrimSpace(body.DisplayName)
	// Guests are anonymous, so the normalized display name is the only stable
	// identity available across tabs or reopens. A new join replaces the old
	// session outright: it revokes the earlier token and works on databases that
	// have not yet applied the optional departure-tracking migration.
	if _, err := s.guestDB.ExecContext(r.Context(), `DELETE FROM guest_meeting_sessions WHERE meeting_id=$1 AND state IN ('waiting','admitted') AND lower(trim(display_name))=lower($2)`, m.ID, displayName); err != nil {
		s.json(w, 500, map[string]string{"message": "Could not replace an earlier guest session"})
		return
	}
	var count int
	_ = s.guestDB.QueryRowContext(r.Context(), `SELECT count(*) FROM guest_meeting_sessions WHERE meeting_id=$1 AND state='admitted'`, m.ID).Scan(&count)
	if count >= guestMeetingLimit {
		s.json(w, 409, map[string]string{"message": "Guest limit reached"})
		return
	}
	secret, e := randomGuestToken()
	if e != nil {
		s.json(w, 500, map[string]string{"message": "Could not join meeting"})
		return
	}
	state := "waiting"
	if m.AdmissionMode == "immediate" {
		state = "admitted"
	}
	id := uuid.NewString()
	_, e = s.guestDB.ExecContext(r.Context(), `INSERT INTO guest_meeting_sessions (id,meeting_id,session_token_hash,display_name,state,admitted_at) VALUES ($1,$2,$3,$4,$5,CASE WHEN $5='admitted' THEN now() END)`, id, m.ID, guestMeetingTokenHash(secret), displayName, state)
	if e != nil {
		s.json(w, 500, map[string]string{"message": "Could not join meeting"})
		return
	}
	// Deliberately omit Path. Browsers derive the public-link directory from the
	// request URL, preserving reverse-proxy prefixes such as /s/{server}/api.
	http.SetCookie(w, &http.Cookie{Name: guestMeetingCookie, Value: secret, HttpOnly: true, Secure: r.TLS != nil, SameSite: http.SameSiteLaxMode, MaxAge: int(time.Until(m.ExpiresAt).Seconds())})
	s.json(w, 201, map[string]string{"id": id, "state": state})
}

func (s *Server) leaveGuestMeetingSession(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	var body struct {
		SessionID string `json:"sessionId"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil || strings.TrimSpace(body.SessionID) == "" {
		s.json(w, 400, map[string]string{"message": "Guest session is required"})
		return
	}
	_, err := s.guestDB.ExecContext(r.Context(), `DELETE FROM guest_meeting_sessions WHERE id=$1 AND meeting_id=$2 AND state IN ('waiting','admitted')`, body.SessionID, m.ID)
	if err != nil {
		s.json(w, 500, map[string]string{"message": "Could not leave meeting"})
		return
	}
	s.json(w, http.StatusNoContent, nil)
}
func (s *Server) publicGuestSession(r *http.Request, m guestMeeting) (guestMeetingSession, error) {
	c, e := r.Cookie(guestMeetingCookie)
	if e != nil {
		return guestMeetingSession{}, e
	}
	var g guestMeetingSession
	e = s.guestDB.QueryRowContext(r.Context(), `SELECT id,display_name,state FROM guest_meeting_sessions WHERE meeting_id=$1 AND session_token_hash=$2`, m.ID, guestMeetingTokenHash(c.Value)).Scan(&g.ID, &g.DisplayName, &g.State)
	return g, e
}
func (s *Server) guestMeetingStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	g, e := s.publicGuestSession(r, m)
	if e != nil {
		s.json(w, 401, map[string]string{"message": "Join the meeting first"})
		return
	}
	s.json(w, 200, map[string]string{"displayName": g.DisplayName, "state": g.State})
}
func (s *Server) createGuestMeetingGuestToken(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	g, e := s.publicGuestSession(r, m)
	if e != nil || g.State != "admitted" {
		s.json(w, 403, map[string]string{"message": "Admission is required"})
		return
	}
	token, e := livekit.TokenIssuer{URL: s.cfg.LiveKitURL, APIKey: s.cfg.LiveKitAPIKey, APISecret: s.cfg.LiveKitAPISecret}.MintWithTTL("guest-meeting:"+m.ID, guestLiveKitIdentity(m.ID, g.DisplayName), g.DisplayName, 15*time.Minute)
	if e != nil {
		s.json(w, 500, map[string]string{"message": "Could not mint meeting token"})
		return
	}
	s.json(w, 200, map[string]string{"url": s.cfg.LiveKitURL, "token": token, "roomName": "guest-meeting:" + m.ID})
}

func (s *Server) guestMeetingIntelligenceStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := s.validPublicMeeting(r.Context(), chi.URLParam(r, "token"))
	if !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	roomID := "guest-meeting:" + m.ID
	var transcriptionActive bool
	if s.transcriptionQueries != nil {
		if session, err := s.transcriptionQueries.Latest(r.Context(), roomID); err == nil && session.Status == "recording" {
			transcriptionActive = true
		}
	}
	var recordingActive bool
	if s.guestDB != nil {
		var count int
		_ = s.guestDB.QueryRowContext(r.Context(), `SELECT count(*) FROM call_recordings WHERE call_id=$1 AND status IN ('recording','stopping')`, roomID).Scan(&count)
		if count > 0 {
			recordingActive = true
		}
	}
	s.json(w, http.StatusOK, map[string]any{
		"transcriptionActive": transcriptionActive,
		"recordingActive":     recordingActive,
	})
}

var _ = sql.ErrNoRows
