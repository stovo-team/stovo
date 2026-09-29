package app

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"

	featureidentity "stovo-messenger/backend/internal/features/identity"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) invitePasskeyOptions(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthMethodRate(r.Context(), "invite-passkey-options", s.getClientIP(r), 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before trying passkey registration again")
		return
	}
	var request struct {
		Nickname string `json:"nickname"`
	}
	if err := decodePasskeyRequest(r, &request); err != nil {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid passkey registration request")
		return
	}
	_, family, err := s.findInviteByToken(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		writeMessageDetail(w, http.StatusNotFound, "Invite not found")
		return
	}
	registration := featureidentity.NormalizeRegistration(featureidentity.Registration{Nickname: request.Nickname}, false)
	if registration.Username == "" || registration.DisplayName == "" {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Enter a valid nickname")
		return
	}
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	userID := uuid.NewString()
	user := passkeyUser{ID: userID, Username: registration.Username, DisplayName: registration.DisplayName}
	creation, session, err := wa.BeginRegistration(user)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not begin passkey registration")
		return
	}
	ceremonyID, err := s.storePasskeyCeremony(r.Context(), storedPasskeyCeremony{Purpose: "invite-register", FamilyID: family.ID, UserID: userID, InviteTokenHash: tokenHash(s.cfg.InviteTokenSecret, chi.URLParam(r, "token")), Session: *session})
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not save passkey registration")
		return
	}
	writeMessageValue(w, http.StatusOK, map[string]any{"ceremonyId": ceremonyID, "publicKey": creation})
}

func (s *Server) acceptInviteWithPasskey(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthMethodRate(r.Context(), "invite-passkey-verify", s.getClientIP(r), 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before trying passkey registration again")
		return
	}
	var request struct {
		Nickname   string          `json:"nickname"`
		CeremonyID string          `json:"ceremonyId"`
		Response   json.RawMessage `json:"response"`
	}
	if err := decodePasskeyRequest(r, &request); err != nil || request.CeremonyID == "" || len(request.Response) == 0 {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid passkey registration response")
		return
	}
	invite, family, err := s.findInviteByToken(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		writeMessageDetail(w, http.StatusNotFound, "Invite not found")
		return
	}
	if err := s.rejectBannedInviteIP(r.Context(), family.ID, s.getClientIP(r)); err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Invite not found")
		return
	}
	registration := featureidentity.NormalizeRegistration(featureidentity.Registration{Nickname: request.Nickname}, false)
	ceremony, err := s.consumePasskeyCeremony(r.Context(), request.CeremonyID, "invite-register")
	if err != nil || ceremony.FamilyID != family.ID || ceremony.InviteTokenHash != tokenHash(s.cfg.InviteTokenSecret, chi.URLParam(r, "token")) {
		writeMessageDetail(w, http.StatusUnauthorized, "Passkey registration expired")
		return
	}
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	user := passkeyUser{ID: ceremony.UserID, Username: registration.Username, DisplayName: registration.DisplayName}
	credential, err := wa.FinishRegistration(user, ceremony.Session, requestWithJSON(r, request.Response))
	if err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Passkey registration could not be verified")
		return
	}
	credentialJSON, err := json.Marshal(credential)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not save passkey")
		return
	}
	defaults, err := s.familyDefaults.Get(r.Context(), family.ID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not load member defaults")
		return
	}
	var familyChatID string
	if err := s.sqlDB.QueryRowContext(r.Context(), `SELECT id FROM chats WHERE family_id = $1 AND type = 'family' LIMIT 1`, family.ID).Scan(&familyChatID); err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not load family chat")
		return
	}
	rawRefresh, refreshHash, refreshExpires, err := s.issueRefreshToken(ceremony.UserID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	password, err := randomToken()
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create account")
		return
	}
	passwordHash, err := hashPassword(password)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create account")
		return
	}
	createdAt := nowString()
	credentialID := base64.RawURLEncoding.EncodeToString(credential.ID)
	ip := s.getClientIP(r)
	tx, err := s.sqlDB.BeginTx(r.Context(), nil)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not accept invite")
		return
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(r.Context(), `INSERT INTO users (id, family_id, username, password_hash, display_name, role, profile_visibility, last_seen_visibility, read_receipts_enabled, is_active, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10)`, ceremony.UserID, family.ID, registration.Username, passwordHash, registration.DisplayName, invite.Role, defaults.ProfileVisibility, defaults.LastSeenVisibility, defaults.ReadReceiptsEnabled, createdAt)
	if err == nil {
		var result sql.Result
		result, err = tx.ExecContext(r.Context(), `UPDATE invites SET used_count = used_count + 1 WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2 AND used_count < max_uses`, invite.ID, createdAt)
		if err == nil {
			var changed int64
			changed, err = result.RowsAffected()
			if err == nil && changed != 1 {
				err = sql.ErrNoRows
			}
		}
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO passkey_credentials (id, user_id, family_id, credential_id, credential_data) VALUES ($1,$2,$3,$4,$5::jsonb)`, uuid.NewString(), ceremony.UserID, family.ID, credentialID, string(credentialJSON))
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_members (chat_id,user_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, familyChatID, ceremony.UserID, createdAt)
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO chat_preferences (chat_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, familyChatID, ceremony.UserID)
	}
	if err == nil {
		_, err = tx.ExecContext(r.Context(), `INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at,created_at,ip_address) VALUES ($1,$2,$3,$4,$5,$6)`, uuid.NewString(), ceremony.UserID, refreshHash, refreshExpires, createdAt, ip)
	}
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeMessageDetail(w, http.StatusConflict, "Username or passkey already exists")
		} else {
			writeMessageDetail(w, http.StatusConflict, "Invite is no longer available")
		}
		return
	}
	if err := tx.Commit(); err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not accept invite")
		return
	}
	newUser, err := s.getUserByID(ceremony.UserID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not load user")
		return
	}
	access, ttl, err := createAccessToken(s.cfg, newUser)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}
	s.writeAuthSuccess(w, r, http.StatusCreated, httptransport.AuthSuccess[userPublic]{AccessToken: access, TokenType: "Bearer", ExpiresInSeconds: ttl, User: newUser, RefreshToken: rawRefresh})
}
