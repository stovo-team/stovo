package app

import (
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
	familyChatID, err = s.authMethods.FamilyChatID(r.Context(), family.ID)
	if err != nil {
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
	err = s.authMethods.AcceptPasskeyInvite(r.Context(), featureidentity.PasskeyInviteAcceptance{
		UserID: ceremony.UserID, FamilyID: family.ID, Username: registration.Username, PasswordHash: passwordHash,
		DisplayName: registration.DisplayName, Role: invite.Role, InviteID: invite.ID, FamilyChatID: familyChatID,
		CredentialRecordID: uuid.NewString(), CredentialID: credentialID, CredentialData: string(credentialJSON),
		RefreshTokenID: uuid.NewString(), RefreshTokenHash: refreshHash, RefreshExpiresAt: refreshExpires,
		CreatedAt: createdAt, IPAddress: ip, ProfileVisibility: defaults.ProfileVisibility,
		LastSeenVisibility: defaults.LastSeenVisibility, ReadReceiptsEnabled: defaults.ReadReceiptsEnabled,
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			writeMessageDetail(w, http.StatusConflict, "Username or passkey already exists")
		} else {
			writeMessageDetail(w, http.StatusConflict, "Invite is no longer available")
		}
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
