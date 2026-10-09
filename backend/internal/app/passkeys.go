package app

import (
	"bytes"
	"context"
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

// The SHA-256 fingerprint of the published Android signing certificate, encoded
// as unpadded base64url rather than the colon-separated hex used in asset links.
const androidPasskeyCredentialOrigin = "android:apk-key-hash:GHz0pWhVAaCHx-QJWbM2nCwZ2dLDAIdyCJJEgUCRN_k"

var (
	errPasskeysRequireHTTPSAppURL  = errors.New("passkeys require a configured HTTPS app origin")
	errPasskeysRequireSecureOrigin = errors.New("passkeys require a secure origin")
	errPasskeyOriginMismatch       = errors.New("origin does not match configured relying party")
)

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
		return nil, errPasskeysRequireHTTPSAppURL
	}
	originURL, err := url.Parse(strings.TrimSpace(r.Header.Get("Origin")))
	if err != nil || originURL.Host == "" || originURL.User != nil || originURL.RawQuery != "" || originURL.Fragment != "" {
		return nil, errors.New("invalid webauthn origin")
	}
	rpID := configured.Hostname()
	origin := originURL.Scheme + "://" + originURL.Host
	// Native HTTP request origins identify permitted clients; their signed
	// WebAuthn client data instead carries the Android certificate origin.
	if s.isNativeClientOrigin(r.Header.Get("Origin")) {
		origin = androidPasskeyCredentialOrigin
	} else if originURL.Scheme != "https" && (originURL.Scheme != "http" || (originURL.Hostname() != "localhost" && originURL.Hostname() != "127.0.0.1")) {
		return nil, errPasskeysRequireSecureOrigin
	}
	if !s.isAllowedWebAuthnOrigin(origin, rpID) {
		return nil, errPasskeyOriginMismatch
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

// isAllowedWebAuthnOrigin checks credential origins, independently of native
// HTTP request admission performed by webAuthnForRequest.
func (s *Server) isAllowedWebAuthnOrigin(origin, rpID string) bool {
	if origin == androidPasskeyCredentialOrigin {
		return true
	}
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

func webAuthnUnavailableMessage(err error) string {
	if err == nil {
		return "Passkeys are unavailable for this origin."
	}
	switch {
	case errors.Is(err, errPasskeysRequireHTTPSAppURL):
		return "Passkeys need APP_URL set to the site's public HTTPS address."
	case errors.Is(err, errPasskeysRequireSecureOrigin):
		return "Passkeys require this page to use HTTPS (localhost is allowed for development)."
	case errors.Is(err, errPasskeyOriginMismatch):
		return "This site's domain doesn't match APP_URL. Set APP_URL to the site's public HTTPS address."
	default:
		return "Passkeys are unavailable for this origin. Check APP_URL and origin configuration."
	}
}

func (s *Server) loadPasskeyUser(ctx context.Context, id, familyID string) (userPublic, passkeyUser, error) {
	account, err := s.loginAccounts.ByID(ctx, id)
	if err != nil || !account.IsActive || (familyID != "" && account.FamilyID != familyID) {
		return userPublic{}, passkeyUser{}, errUnauthorized
	}
	rows, err := s.authMethods.ListPasskeyCredentials(ctx, id, account.FamilyID)
	if err != nil {
		return userPublic{}, passkeyUser{}, err
	}
	credentials := make([]webauthnlib.Credential, 0, len(rows))
	for _, raw := range rows {
		var credential webauthnlib.Credential
		if err := json.Unmarshal(raw, &credential); err != nil {
			return userPublic{}, passkeyUser{}, err
		}
		credentials = append(credentials, credential)
	}
	return s.userPublicFromAccount(account), passkeyUser{ID: account.ID, Username: account.Username, DisplayName: account.DisplayName, Credentials: credentials}, nil
}

func (s *Server) storePasskeyCeremony(ctx context.Context, ceremony storedPasskeyCeremony) (string, error) {
	_ = s.authMethods.CleanupExpiredAuthRequests(ctx)
	rawID, err := randomToken()
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(ceremony.Session)
	if err != nil {
		return "", err
	}
	err = s.authMethods.SavePasskeyCeremony(ctx, tokenHash(s.cfg.RefreshTokenSecret, rawID), ceremony.Purpose, ceremony.FamilyID, ceremony.UserID, ceremony.InviteTokenHash, encoded, time.Now().Add(passkeyCeremonyTTL))
	if err != nil {
		return "", err
	}
	return rawID, nil
}

func (s *Server) consumePasskeyCeremony(ctx context.Context, rawID, purpose string) (storedPasskeyCeremony, error) {
	var ceremony storedPasskeyCeremony
	stored, err := s.authMethods.ConsumePasskeyCeremony(ctx, tokenHash(s.cfg.RefreshTokenSecret, rawID), purpose)
	if err != nil {
		return storedPasskeyCeremony{}, err
	}
	if err := json.Unmarshal(stored.SessionData, &ceremony.Session); err != nil {
		return storedPasskeyCeremony{}, err
	}
	ceremony.ID, ceremony.Purpose = rawID, purpose
	ceremony.FamilyID, ceremony.UserID = stored.FamilyID, stored.UserID
	ceremony.InviteTokenHash = stored.InviteTokenHash
	return ceremony, nil
}

func (s *Server) passkeyRegistrationOptions(w http.ResponseWriter, r *http.Request, actor userPublic) {
	wa, err := s.webAuthnForRequest(r)
	if err != nil {
		writeMessageDetail(w, http.StatusBadRequest, webAuthnUnavailableMessage(err))
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
		writeMessageDetail(w, http.StatusBadRequest, webAuthnUnavailableMessage(err))
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
	err = s.authMethods.SavePasskeyCredential(r.Context(), uuid.NewString(), actor.ID, actor.FamilyID, base64.RawURLEncoding.EncodeToString(credential.ID), encoded)
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
		writeMessageDetail(w, http.StatusBadRequest, webAuthnUnavailableMessage(err))
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
		writeMessageDetail(w, http.StatusBadRequest, webAuthnUnavailableMessage(err))
		return
	}
	credentialRequest := requestWithJSON(r, request.Response)
	var accountID string
	user, credential, err := wa.FinishPasskeyLogin(func(rawID, _ []byte) (webauthnlib.User, error) {
		credentialID := base64.RawURLEncoding.EncodeToString(rawID)
		id, queryErr := s.authMethods.PasskeyOwner(r.Context(), credentialID)
		if queryErr != nil {
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
	_ = s.authMethods.UpdatePasskeyCredential(r.Context(), base64.RawURLEncoding.EncodeToString(credential.ID), credentialJSON)
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
