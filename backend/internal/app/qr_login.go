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
	_ = s.authMethods.CleanupExpiredAuthRequests(r.Context())
	rawID, err := randomToken()
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not start QR sign-in")
		return
	}
	expiresAt := time.Now().Add(qrLoginTTL)
	err = s.authMethods.CreateQRLogin(r.Context(), tokenHash(s.cfg.RefreshTokenSecret, rawID), s.getClientIP(r), expiresAt)
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
	request, err := s.authMethods.QRLogin(r.Context(), hash)
	if err == sql.ErrNoRows {
		writeMessageDetail(w, http.StatusNotFound, "QR sign-in request not found")
		return
	}
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not check QR sign-in")
		return
	}
	if request.Status == "pending" && !request.ExpiresAt.After(time.Now()) {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": "expired"})
		return
	}
	if request.Status != "approved" {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": request.Status})
		return
	}
	claimedUserID, err := s.authMethods.ClaimQRLogin(r.Context(), hash)
	if err == sql.ErrNoRows {
		writeMessageValue(w, http.StatusOK, map[string]string{"status": "completed"})
		return
	}
	if err != nil || claimedUserID != request.ApprovedUserID {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not complete QR sign-in")
		return
	}
	user, err := s.getUserByID(claimedUserID)
	if err != nil || !user.IsActive {
		writeMessageDetail(w, http.StatusUnauthorized, "QR sign-in is no longer available")
		return
	}
	if !request.ExpiresAt.After(time.Now()) {
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
	changed, err := s.authMethods.TransitionQRLogin(r.Context(), tokenHash(s.cfg.RefreshTokenSecret, rawID), next, actor.FamilyID, actor.ID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not update QR sign-in request")
		return
	}
	if err != nil || !changed {
		writeMessageDetail(w, http.StatusConflict, "QR sign-in request has expired or already received a response")
		return
	}
	writeMessageValue(w, http.StatusOK, map[string]string{"status": next})
}

func (s *Server) allowAuthMethodRate(ctx context.Context, name, clientIP string, limit, ttl int) bool {
	count, err := s.cache.Increment(ctx, "rate-limit:auth-method:"+name+":"+clientIP, ttl)
	return err == nil && count <= int64(limit)
}

// createAndroidQRLogin creates a separate desktop-to-Android bearer grant.
func (s *Server) createAndroidQRLogin(w http.ResponseWriter, r *http.Request, actor userPublic) {
	if !s.allowAuthMethodRate(r.Context(), "android-qr-create", s.getClientIP(r), 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before requesting another sign-in code")
		return
	}
	rawID, err := randomToken()
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not start Android QR sign-in")
		return
	}
	expiresAt := time.Now().Add(2 * time.Minute)
	if err := s.authMethods.CreateAndroidQRLoginGrant(r.Context(), tokenHash(s.cfg.RefreshTokenSecret, rawID), actor.FamilyID, actor.ID, expiresAt); err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not start Android QR sign-in")
		return
	}
	writeMessageValue(w, http.StatusCreated, map[string]any{"requestId": rawID, "expiresAt": expiresAt.UTC().Format(time.RFC3339Nano)})
}

func (s *Server) redeemAndroidQRLogin(w http.ResponseWriter, r *http.Request) {
	ip := s.getClientIP(r)
	if !s.allowAuthMethodRate(r.Context(), "android-qr-redeem", ip, 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before redeeming another sign-in code")
		return
	}
	// Atomic consumption comes first so any accepted bearer is single-use even
	// if the account or receiving device is no longer permitted to sign in.
	grant, err := s.authMethods.ConsumeAndroidQRLoginGrant(r.Context(), tokenHash(s.cfg.RefreshTokenSecret, chi.URLParam(r, "requestID")))
	if err == sql.ErrNoRows {
		writeMessageDetail(w, http.StatusUnauthorized, "Android QR sign-in is no longer available")
		return
	}
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not complete Android QR sign-in")
		return
	}
	user, err := s.getUserByID(grant.UserID)
	if err != nil || !user.IsActive || user.FamilyID != grant.FamilyID {
		writeMessageDetail(w, http.StatusUnauthorized, "Android QR sign-in is no longer available")
		return
	}
	banned, err := s.isFamilyIPBanned(r.Context(), grant.FamilyID, ip)
	if err != nil || banned {
		writeMessageDetail(w, http.StatusUnauthorized, "Android QR sign-in is no longer available")
		return
	}
	raw, hash, expiresAt, err := s.issueRefreshToken(user.ID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	if err := s.sessionWriter.CreateSession(r.Context(), identity.PersistedSession{ID: uuid.NewString(), UserID: user.ID, TokenHash: hash, ExpiresAt: expiresAt, CreatedAt: nowString(), IPAddress: ip}); err != nil {
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
