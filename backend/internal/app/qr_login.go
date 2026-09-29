package app

import (
	"context"
	"database/sql"
	"net/http"
	"net/url"
	"time"

	"stovo-messenger/backend/internal/features/identity"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const qrLoginTTL = 5 * time.Minute

func (s *Server) createQRLogin(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthMethodRate(r.Context(), "qr-create", s.getClientIP(r), 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before requesting another sign-in code")
		return
	}
	_, _ = s.sqlDB.ExecContext(r.Context(), `DELETE FROM qr_login_requests WHERE expires_at < now() - interval '1 day'`)
	rawID, err := randomToken()
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not start QR sign-in")
		return
	}
	expiresAt := time.Now().Add(qrLoginTTL)
	_, err = s.sqlDB.ExecContext(r.Context(), `INSERT INTO qr_login_requests (request_hash, status, browser_ip, expires_at) VALUES ($1, 'pending', $2, $3)`, tokenHash(s.cfg.RefreshTokenSecret, rawID), s.getClientIP(r), expiresAt)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not start QR sign-in")
		return
	}
	scanURL := "stovo://auth/qr-approve/" + url.PathEscape(rawID)
	writeMessageValue(w, http.StatusCreated, map[string]any{"requestId": rawID, "scanUrl": scanURL, "expiresAt": expiresAt.UTC().Format(time.RFC3339Nano)})
}

func (s *Server) qrLoginStatus(w http.ResponseWriter, r *http.Request) {
	rawID := chi.URLParam(r, "requestID")
	if rawID == "" || !s.allowAuthMethodRate(r.Context(), "qr-poll:"+tokenHash(s.cfg.RefreshTokenSecret, rawID), s.getClientIP(r), 80, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "QR sign-in polling limit reached")
		return
	}
	hash := tokenHash(s.cfg.RefreshTokenSecret, rawID)
	var status string
	var userID sql.NullString
	var expiresAt time.Time
	err := s.sqlDB.QueryRowContext(r.Context(), `SELECT status, approved_user_id, expires_at FROM qr_login_requests WHERE request_hash = $1`, hash).Scan(&status, &userID, &expiresAt)
	if err == sql.ErrNoRows {
		writeMessageDetail(w, http.StatusNotFound, "QR sign-in request not found")
		return
	}
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not check QR sign-in")
		return
	}
	if status == "pending" && !expiresAt.After(time.Now()) {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": "expired"})
		return
	}
	if status != "approved" {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": status})
		return
	}
	var claimedUserID string
	err = s.sqlDB.QueryRowContext(r.Context(), `UPDATE qr_login_requests SET status = 'completed', completed_at = now() WHERE request_hash = $1 AND status = 'approved' AND expires_at > now() RETURNING approved_user_id`, hash).Scan(&claimedUserID)
	if err == sql.ErrNoRows {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": "completed"})
		return
	}
	if err != nil || !userID.Valid || claimedUserID != userID.String {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not complete QR sign-in")
		return
	}
	user, err := s.getUserByID(claimedUserID)
	if err != nil || !user.IsActive {
		writeMessageDetail(w, http.StatusUnauthorized, "QR sign-in is no longer available")
		return
	}
	if !expiresAt.After(time.Now()) {
		writeMessageDetail(w, http.StatusGone, "QR sign-in request expired")
		return
	}
	ip := s.getClientIP(r)
	banned, err := s.isFamilyIPBanned(r.Context(), user.FamilyID, ip)
	if err != nil || banned {
		writeMessageDetail(w, http.StatusUnauthorized, "QR sign-in is no longer available")
		return
	}
	raw, tokenHashValue, tokenExpires, err := s.issueRefreshToken(user.ID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	if err := s.sessionWriter.CreateSession(r.Context(), identity.PersistedSession{ID: uuid.NewString(), UserID: user.ID, TokenHash: tokenHashValue, ExpiresAt: tokenExpires, CreatedAt: nowString(), IPAddress: ip}); err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not save session")
		return
	}
	access, ttl, err := createAccessToken(s.cfg, user)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}
	s.writeAuthSuccess(w, r, http.StatusOK, httptransport.AuthSuccess[userPublic]{AccessToken: access, TokenType: "Bearer", ExpiresInSeconds: ttl, User: user, RefreshToken: raw})
}

func (s *Server) approveQRLogin(w http.ResponseWriter, r *http.Request, actor userPublic) {
	s.transitionQRLogin(w, r, actor, "approved")
}

func (s *Server) rejectQRLogin(w http.ResponseWriter, r *http.Request, actor userPublic) {
	s.transitionQRLogin(w, r, actor, "rejected")
}

func (s *Server) transitionQRLogin(w http.ResponseWriter, r *http.Request, actor userPublic, next string) {
	if !actor.IsActive || !s.allowAuthMethodRate(r.Context(), "qr-approval:"+actor.ID, s.getClientIP(r), 20, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before responding to QR sign-in requests")
		return
	}
	if next == "approved" {
		banned, err := s.isFamilyIPBanned(r.Context(), actor.FamilyID, s.getClientIP(r))
		if err != nil || banned {
			writeMessageDetail(w, http.StatusUnauthorized, "QR sign-in request unavailable")
			return
		}
	}
	rawID := chi.URLParam(r, "requestID")
	if rawID == "" {
		writeMessageDetail(w, http.StatusNotFound, "QR sign-in request not found")
		return
	}
	result, err := s.sqlDB.ExecContext(r.Context(), `UPDATE qr_login_requests SET status = $1, family_id = $2, approved_user_id = CASE WHEN $1 = 'approved' THEN $3 ELSE NULL END WHERE request_hash = $4 AND status = 'pending' AND expires_at > now() AND (family_id IS NULL OR family_id = $2)`, next, actor.FamilyID, actor.ID, tokenHash(s.cfg.RefreshTokenSecret, rawID))
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not update QR sign-in request")
		return
	}
	changed, err := result.RowsAffected()
	if err != nil || changed != 1 {
		writeMessageDetail(w, http.StatusConflict, "QR sign-in request has expired or already received a response")
		return
	}
	writeMessageValue(w, http.StatusOK, map[string]string{"status": next})
}

func (s *Server) allowAuthMethodRate(ctx context.Context, name, clientIP string, limit, ttl int) bool {
	count, err := s.cache.Increment(ctx, "rate-limit:auth-method:"+name+":"+clientIP, ttl)
	return err == nil && count <= int64(limit)
}
