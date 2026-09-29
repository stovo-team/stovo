package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	featureidentity "stovo-messenger/backend/internal/features/identity"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/go-webauthn/webauthn/protocol"
	webauthnlib "github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
)

const passkeyCeremonyTTL = 5 * time.Minute

type storedPasskeyCeremony struct {
	ID              string
	Purpose         string
	FamilyID        string
	UserID          string
	InviteTokenHash string
	Session         webauthnlib.SessionData
}

type passkeyUser struct {
	ID          string
	Username    string
	DisplayName string
	Credentials []webauthnlib.Credential
}

func (u passkeyUser) WebAuthnID() []byte                            { return []byte(u.ID) }
func (u passkeyUser) WebAuthnName() string                          { return u.Username }
func (u passkeyUser) WebAuthnDisplayName() string                   { return u.DisplayName }
func (u passkeyUser) WebAuthnCredentials() []webauthnlib.Credential { return u.Credentials }

func (s *Server) webAuthnForRequest(r *http.Request) (*webauthnlib.WebAuthn, error) {
	configured, err := url.Parse(strings.TrimSpace(s.cfg.AppURL))
	if err != nil || configured.Hostname() == "" || (configured.Scheme != "https" && configured.Hostname() != "localhost" && configured.Hostname() != "127.0.0.1") {
		return nil, errors.New("passkeys require a configured HTTPS app origin")
	}
	originURL, err := url.Parse(strings.TrimSpace(r.Header.Get("Origin")))
	if err != nil || originURL.Host == "" || originURL.User != nil || originURL.RawQuery != "" || originURL.Fragment != "" {
		return nil, errors.New("invalid webauthn origin")
	}
	rpID := configured.Hostname()
	if originURL.Scheme != "https" && originURL.Hostname() != "localhost" && originURL.Hostname() != "127.0.0.1" {
		return nil, errors.New("passkeys require a secure origin")
	}
	origin := originURL.Scheme + "://" + originURL.Host
	if !s.isAllowedWebAuthnOrigin(origin, rpID) {
		return nil, errors.New("origin does not match configured relying party")
	}
	return webauthnlib.New(&webauthnlib.Config{
		RPDisplayName: "Stovo",
		RPID:          rpID,
		RPOrigins:     []string{origin},
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			RequireResidentKey: protocol.ResidentKeyRequired(),
		},
	})
}

func (s *Server) isAllowedWebAuthnOrigin(origin, rpID string) bool {
	configured, err := url.Parse(strings.TrimSpace(s.cfg.AppURL))
	if err == nil && configured.Host != "" && configured.Scheme+"://"+configured.Host == origin {
		return true
	}
	for _, candidate := range s.cfg.CORSAllowedOrigins {
		parsed, parseErr := url.Parse(strings.TrimSpace(candidate))
		if parseErr != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			continue
		}
		if parsed.Scheme+"://"+parsed.Host != origin {
			continue
		}
		if parsed.Hostname() == rpID || strings.HasSuffix(parsed.Hostname(), "."+rpID) {
			return true
		}
	}
	return false
}

func (s *Server) loadPasskeyUser(ctx context.Context, id, familyID string) (userPublic, passkeyUser, error) {
	account, err := s.loginAccounts.ByID(ctx, id)
	if err != nil || !account.IsActive || (familyID != "" && account.FamilyID != familyID) {
		return userPublic{}, passkeyUser{}, errUnauthorized
	}
	rows, err := s.sqlDB.QueryContext(ctx, `SELECT credential_data FROM passkey_credentials WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`, id, account.FamilyID)
	if err != nil {
		return userPublic{}, passkeyUser{}, err
	}
	defer rows.Close()
	credentials := make([]webauthnlib.Credential, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return userPublic{}, passkeyUser{}, err
		}
		var credential webauthnlib.Credential
		if err := json.Unmarshal(raw, &credential); err != nil {
			return userPublic{}, passkeyUser{}, err
		}
		credentials = append(credentials, credential)
	}
	if err := rows.Err(); err != nil {
		return userPublic{}, passkeyUser{}, err
	}
	return s.userPublicFromAccount(account), passkeyUser{ID: account.ID, Username: account.Username, DisplayName: account.DisplayName, Credentials: credentials}, nil
}

func (s *Server) storePasskeyCeremony(ctx context.Context, ceremony storedPasskeyCeremony) (string, error) {
	_, _ = s.sqlDB.ExecContext(ctx, `DELETE FROM passkey_ceremonies WHERE expires_at < now() - interval '1 day'`)
	rawID, err := randomToken()
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(ceremony.Session)
	if err != nil {
		return "", err
	}
	_, err = s.sqlDB.ExecContext(ctx, `INSERT INTO passkey_ceremonies (id_hash, purpose, family_id, user_id, invite_token_hash, session_data, expires_at) VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, $7)`, tokenHash(s.cfg.RefreshTokenSecret, rawID), ceremony.Purpose, ceremony.FamilyID, ceremony.UserID, ceremony.InviteTokenHash, encoded, time.Now().Add(passkeyCeremonyTTL))
	if err != nil {
		return "", err
	}
	return rawID, nil
}

func (s *Server) consumePasskeyCeremony(ctx context.Context, rawID, purpose string) (storedPasskeyCeremony, error) {
	var ceremony storedPasskeyCeremony
	var familyID, userID, inviteTokenHash sql.NullString
	var encoded []byte
	err := s.sqlDB.QueryRowContext(ctx, `UPDATE passkey_ceremonies SET consumed_at = now() WHERE id_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING family_id, user_id, invite_token_hash, session_data`, tokenHash(s.cfg.RefreshTokenSecret, rawID), purpose).Scan(&familyID, &userID, &inviteTokenHash, &encoded)
	if err != nil {
		return storedPasskeyCeremony{}, err
	}
	if err := json.Unmarshal(encoded, &ceremony.Session); err != nil {
		return storedPasskeyCeremony{}, err
	}
	ceremony.ID, ceremony.Purpose = rawID, purpose
	ceremony.FamilyID, ceremony.UserID = familyID.String, userID.String
	ceremony.InviteTokenHash = inviteTokenHash.String
	return ceremony, nil
}

func (s *Server) passkeyRegistrationOptions(w http.ResponseWriter, r *http.Request, actor userPublic) {
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	_, user, err := s.loadPasskeyUser(r.Context(), actor.ID, actor.FamilyID)
	if err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	creation, session, err := wa.BeginRegistration(user)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not begin passkey registration")
		return
	}
	ceremonyID, err := s.storePasskeyCeremony(r.Context(), storedPasskeyCeremony{Purpose: "register", FamilyID: actor.FamilyID, UserID: actor.ID, Session: *session})
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not save passkey registration")
		return
	}
	writeMessageValue(w, http.StatusOK, map[string]any{"ceremonyId": ceremonyID, "publicKey": creation})
}

func (s *Server) passkeyRegistrationVerify(w http.ResponseWriter, r *http.Request, actor userPublic) {
	var request struct {
		CeremonyID string          `json:"ceremonyId"`
		Response   json.RawMessage `json:"response"`
	}
	if err := decodePasskeyRequest(r, &request); err != nil || request.CeremonyID == "" || len(request.Response) == 0 {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid passkey registration response")
		return
	}
	ceremony, err := s.consumePasskeyCeremony(r.Context(), request.CeremonyID, "register")
	if err != nil || ceremony.UserID != actor.ID || ceremony.FamilyID != actor.FamilyID {
		writeMessageDetail(w, http.StatusUnauthorized, "Passkey registration expired")
		return
	}
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	_, user, err := s.loadPasskeyUser(r.Context(), actor.ID, actor.FamilyID)
	if err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	credentialRequest := requestWithJSON(r, request.Response)
	credential, err := wa.FinishRegistration(user, ceremony.Session, credentialRequest)
	if err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Passkey registration could not be verified")
		return
	}
	encoded, err := json.Marshal(credential)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not store passkey")
		return
	}
	_, err = s.sqlDB.ExecContext(r.Context(), `INSERT INTO passkey_credentials (id, user_id, family_id, credential_id, credential_data) VALUES ($1, $2, $3, $4, $5)`, uuid.NewString(), actor.ID, actor.FamilyID, base64.RawURLEncoding.EncodeToString(credential.ID), encoded)
	if err != nil {
		writeMessageDetail(w, http.StatusConflict, "Passkey is already registered")
		return
	}
	writeMessageValue(w, http.StatusCreated, map[string]string{"status": "registered"})
}

func (s *Server) passkeyAuthenticationOptions(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthMethodRate(r.Context(), "passkey-options", s.getClientIP(r), 12, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before trying passkey sign-in again")
		return
	}
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	assertion, session, err := wa.BeginDiscoverableLogin()
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not begin passkey sign-in")
		return
	}
	ceremonyID, err := s.storePasskeyCeremony(r.Context(), storedPasskeyCeremony{Purpose: "authenticate", Session: *session})
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not save passkey sign-in")
		return
	}
	writeMessageValue(w, http.StatusOK, map[string]any{"ceremonyId": ceremonyID, "publicKey": assertion})
}

func (s *Server) passkeyAuthenticationVerify(w http.ResponseWriter, r *http.Request) {
	if !s.allowAuthMethodRate(r.Context(), "passkey-verify", s.getClientIP(r), 8, 60) {
		writeMessageDetail(w, http.StatusTooManyRequests, "Please wait before trying passkey sign-in again")
		return
	}
	var request struct {
		CeremonyID string          `json:"ceremonyId"`
		Response   json.RawMessage `json:"response"`
	}
	if err := decodePasskeyRequest(r, &request); err != nil || request.CeremonyID == "" || len(request.Response) == 0 {
		writeMessageDetail(w, http.StatusUnprocessableEntity, "Invalid passkey assertion")
		return
	}
	ceremony, err := s.consumePasskeyCeremony(r.Context(), request.CeremonyID, "authenticate")
	if err != nil {
		writeMessageDetail(w, http.StatusUnauthorized, "Invalid passkey sign-in")
		return
	}
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, "Passkeys are unavailable for this origin")
		return
	}
	credentialRequest := requestWithJSON(r, request.Response)
	var accountID string
	user, credential, err := wa.FinishPasskeyLogin(func(rawID, _ []byte) (webauthnlib.User, error) {
		credentialID := base64.RawURLEncoding.EncodeToString(rawID)
		var id string
		if queryErr := s.sqlDB.QueryRowContext(r.Context(), `SELECT user_id FROM passkey_credentials WHERE credential_id = $1 AND revoked_at IS NULL`, credentialID).Scan(&id); queryErr != nil {
			return nil, queryErr
		}
		_, candidate, loadErr := s.loadPasskeyUser(r.Context(), id, "")
		if loadErr != nil {
			return nil, loadErr
		}
		accountID = id
		return candidate, nil
	}, ceremony.Session, credentialRequest)
	if err != nil || user == nil || credential == nil || accountID == "" {
		writeMessageDetail(w, http.StatusUnauthorized, "Invalid passkey sign-in")
		return
	}
	credentialJSON, err := json.Marshal(credential)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not update passkey")
		return
	}
	_, _ = s.sqlDB.ExecContext(r.Context(), `UPDATE passkey_credentials SET credential_data = $1, last_used_at = now() WHERE credential_id = $2 AND revoked_at IS NULL`, credentialJSON, base64.RawURLEncoding.EncodeToString(credential.ID))
	publicUser, err := s.getUserByID(accountID)
	if err != nil || !publicUser.IsActive {
		writeMessageDetail(w, http.StatusUnauthorized, "Invalid passkey sign-in")
		return
	}
	s.completeWebAuthnLogin(w, r, publicUser)
}

func (s *Server) completeWebAuthnLogin(w http.ResponseWriter, r *http.Request, user userPublic) {
	ip := s.getClientIP(r)
	banned, err := s.isFamilyIPBanned(r.Context(), user.FamilyID, ip)
	if err != nil || banned {
		writeMessageDetail(w, http.StatusUnauthorized, "Invalid passkey sign-in")
		return
	}
	raw, hash, expires, err := s.issueRefreshToken(user.ID)
	if err != nil {
		writeMessageDetail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	if err := s.sessionWriter.CreateSession(r.Context(), featureidentity.PersistedSession{ID: uuid.NewString(), UserID: user.ID, TokenHash: hash, ExpiresAt: expires, CreatedAt: nowString(), IPAddress: ip}); err != nil {
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

func decodePasskeyRequest(r *http.Request, target any) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, (1<<20)+1))
	if err != nil {
		return err
	}
	if len(body) > 1<<20 {
		return errors.New("request body too large")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	return decoder.Decode(target)
}

func requestWithJSON(original *http.Request, raw json.RawMessage) *http.Request {
	request := original.Clone(original.Context())
	request.Body = io.NopCloser(bytes.NewReader(raw))
	request.ContentLength = int64(len(raw))
	request.Header.Set("Content-Type", "application/json")
	return request
}
