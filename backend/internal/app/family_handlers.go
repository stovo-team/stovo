package app

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"

	"github.com/google/uuid"
)

func (s *Server) handleGetFamily(w http.ResponseWriter, _ *http.Request, user userPublic) {
	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	s.json(w, http.StatusOK, family)
}

func (s *Server) handleUpdateFamily(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Owner or admin access required")
		return
	}
	var payload updateFamilyRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	name := trimStringPointer(payload.Name)
	if name != nil && *name == "" {
		s.detail(w, http.StatusUnprocessableEntity, "name cannot be blank")
		return
	}
	if payload.StorageLimitMB != nil && *payload.StorageLimitMB <= 0 {
		s.detail(w, http.StatusUnprocessableEntity, "storageLimitMb must be positive")
		return
	}

	if err := s.store.UpdateFamily(r.Context(), user.FamilyID, repository.UpdateFamilyParams{
		Name:                name,
		StorageLimitMB:      payload.StorageLimitMB,
		MinimizedChatLayout: payload.MinimizedChatLayout,
		UpdatedAt:           nowString(),
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update family")
		return
	}

	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	s.json(w, http.StatusOK, family)
}

func (s *Server) handleGetMembers(w http.ResponseWriter, r *http.Request, user userPublic) {
	rows, err := s.store.ListActiveFamilyMembers(r.Context(), user.FamilyID, connectorRole)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load members")
		return
	}

	members := make([]userPublic, 0, len(rows))
	for _, row := range rows {
		members = append(members, s.userPublicFromEnt(row))
	}
	s.json(w, http.StatusOK, members)
}

func (s *Server) handleChangeRole(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Permission denied")
		return
	}

	var payload changeRoleRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	if !isValidRole(payload.Role) || payload.Role == ownerRole {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid role")
		return
	}

	target, err := s.getUserByID(userIDFromURL(r))
	if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
		s.detail(w, http.StatusNotFound, "Member not found")
		return
	}

	if err := s.store.UpdateUserRole(r.Context(), target.ID, payload.Role); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update role")
		return
	}

	updated, _ := s.getUserByID(target.ID)
	s.json(w, http.StatusOK, updated)
}

func (s *Server) handleRemoveMember(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Permission denied")
		return
	}
	targetID := userIDFromURL(r)
	if targetID == user.ID {
		s.detail(w, http.StatusForbidden, "You cannot remove yourself")
		return
	}
	target, err := s.getUserByID(targetID)
	if err != nil || target.FamilyID != user.FamilyID || !target.IsActive {
		s.detail(w, http.StatusNotFound, "Member not found")
		return
	}

	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		if err := s.store.DeactivateUser(r.Context(), tx, target.ID); err != nil {
			return err
		}
		return s.store.RevokeUserSessions(r.Context(), tx, target.ID, nowString())
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCreateInvite(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Owner or admin access required")
		return
	}
	var payload createInviteRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	role := payload.Role
	if role == "" {
		role = memberRole
	}
	if !isValidRole(role) || role == ownerRole {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid role")
		return
	}
	expiresHours := 48
	if payload.ExpiresInHours != nil {
		expiresHours = *payload.ExpiresInHours
	}
	maxUses := 1
	if payload.MaxUses != nil {
		maxUses = *payload.MaxUses
	}
	if expiresHours < 1 || expiresHours > 720 || maxUses < 1 || maxUses > 100 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid invite settings")
		return
	}

	rawToken, err := randomToken()
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create invite")
		return
	}
	inviteID := uuid.NewString()
	expiresAt := time.Now().Add(time.Duration(expiresHours) * time.Hour).UTC()
	if err := s.store.CreateInviteTx(r.Context(), repository.CreateInviteParams{
		ID:        inviteID,
		FamilyID:  user.FamilyID,
		TokenHash: tokenHash(s.cfg.InviteTokenSecret, rawToken),
		Role:      role,
		ExpiresAt: expiresAt.Format(time.RFC3339Nano),
		MaxUses:   maxUses,
		CreatedBy: user.ID,
		CreatedAt: nowString(),
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create invite")
		return
	}

	invite, err := s.getInviteByID(r.Context(), inviteID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load invite")
		return
	}

	family, err := s.getFamily(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusNotFound, "Family not found")
		return
	}
	inviteURL := buildInviteURL(family, s.cfg.AppURL, s.cfg.APIURL, rawToken)
	s.json(w, http.StatusCreated, createInviteResponse{
		InviteURL: inviteURL,
		Invite:    invite,
	})
}

func (s *Server) handlePreviewInvite(w http.ResponseWriter, r *http.Request) {
	invite, family, err := s.findInviteByToken(r.Context(), inviteTokenFromURL(r))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Invite not found")
		return
	}
	s.json(w, http.StatusOK, invitePreviewResponse{
		FamilyName:    family.Name,
		Role:          invite.Role,
		ExpiresAt:     invite.ExpiresAt,
		UsesRemaining: invite.MaxUses - invite.UsedCount,
	})
}

func (s *Server) handleAcceptInvite(w http.ResponseWriter, r *http.Request) {
	var payload acceptInviteRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	payload.Username = strings.TrimSpace(payload.Username)
	payload.DisplayName = strings.TrimSpace(payload.DisplayName)
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	applyNicknameRegistrationDefaults(nil, &payload.Username, &payload.DisplayName, payload.Nickname)
	if payload.Username == "" || payload.DisplayName == "" || len(payload.Password) < 8 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid invite acceptance payload")
		return
	}

	invite, family, err := s.findInviteByToken(r.Context(), inviteTokenFromURL(r))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Invite not found")
		return
	}

	passwordHash, err := hashPassword(payload.Password)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not hash password")
		return
	}

	userID := uuid.NewString()
	now := nowString()
	token, refreshHash, refreshExpires, err := s.issueRefreshToken(userID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create session")
		return
	}

	familyChatID, err := s.store.FamilyChatID(r.Context(), family.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load family chat")
		return
	}

	err = s.store.AcceptInvite(r.Context(), repository.AcceptInviteParams{
		UserID:         userID,
		FamilyID:       family.ID,
		Username:       payload.Username,
		PasswordHash:   passwordHash,
		DisplayName:    payload.DisplayName,
		Role:           invite.Role,
		InviteID:       invite.ID,
		FamilyChatID:   familyChatID,
		RefreshTokenID: uuid.NewString(),
		TokenHash:      refreshHash,
		ExpiresAt:      refreshExpires,
		CreatedAt:      now,
		IPAddress:      s.getClientIP(r),
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			s.detail(w, http.StatusConflict, "Username already exists")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Could not accept invite")
		return
	}

	newUser, err := s.getUserByID(userID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load user")
		return
	}
	accessToken, expiresInSeconds, err := createAccessToken(s.cfg, newUser)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}
	s.setRefreshCookie(w, token)
	s.json(w, http.StatusCreated, authResponse{
		AccessToken:      accessToken,
		TokenType:        "Bearer",
		ExpiresInSeconds: expiresInSeconds,
		User:             newUser,
	})
}

func (s *Server) handleDeleteInvite(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Owner or admin access required")
		return
	}
	invite, err := s.getInviteByID(r.Context(), inviteIDFromURL(r))
	if err != nil || invite.FamilyID != user.FamilyID {
		s.detail(w, http.StatusNotFound, "Invite not found")
		return
	}
	if err := s.store.RevokeInvite(r.Context(), invite.ID, nowString()); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not revoke invite")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getInviteByID(ctx context.Context, inviteID string) (invitePublic, error) {
	inv, err := s.store.InviteByID(ctx, inviteID)
	if err != nil {
		return invitePublic{}, err
	}
	return invitePublicFromEnt(inv), nil
}

func (s *Server) findInviteByToken(ctx context.Context, rawToken string) (invitePublic, familyPublic, error) {
	hashed := tokenHash(s.cfg.InviteTokenSecret, rawToken)
	inv, err := s.store.InviteByTokenHash(ctx, hashed)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	invite := invitePublicFromEnt(inv)
	if invite.RevokedAt != nil || invite.UsedCount >= invite.MaxUses || invite.ExpiresAt.Before(time.Now()) {
		return invitePublic{}, familyPublic{}, errNotFound
	}
	family, err := s.getFamily(invite.FamilyID)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	return invite, family, nil
}

func invitePublicFromEnt(inv *ent.Invite) invitePublic {
	invite := invitePublic{
		ID:        inv.ID,
		FamilyID:  inv.FamilyID,
		Role:      inv.Role,
		ExpiresAt: parseTime(inv.ExpiresAt),
		MaxUses:   inv.MaxUses,
		UsedCount: inv.UsedCount,
		CreatedBy: inv.CreatedBy,
		CreatedAt: parseTime(inv.CreatedAt),
	}
	if inv.RevokedAt != nil {
		revoked := parseTime(*inv.RevokedAt)
		invite.RevokedAt = &revoked
	}
	return invite
}

func buildInviteURL(family familyPublic, defaultAppURL, defaultAPIURL, rawToken string) string {
	appURL := strings.TrimRight(strings.TrimSpace(defaultAppURL), "/")
	apiURL := strings.TrimRight(strings.TrimSpace(defaultAPIURL), "/")

	hasPublicAppURL := family.PublicAppURL != nil && strings.TrimSpace(*family.PublicAppURL) != ""
	hasPublicAPIURL := family.PublicAPIURL != nil && strings.TrimSpace(*family.PublicAPIURL) != ""

	if hasPublicAppURL {
		appURL = strings.TrimRight(strings.TrimSpace(*family.PublicAppURL), "/")
	}
	if hasPublicAPIURL {
		apiURL = strings.TrimRight(strings.TrimSpace(*family.PublicAPIURL), "/")
	}

	baseURL := appURL
	if !hasPublicAppURL && hasPublicAPIURL {
		baseURL = apiURL
	}
	if hasPublicAppURL && hasPublicAPIURL && appURL != apiURL {
		baseURL = apiURL
	}

	inviteURL := fmt.Sprintf("%s/invite/%s", baseURL, url.PathEscape(rawToken))
	if appURL != apiURL {
		return inviteURL + "?apiUrl=" + url.QueryEscape(apiURL)
	}
	return inviteURL
}

func publicAccessSettingsForFamily(family familyPublic, cfgAppURL, cfgAPIURL string) publicAccessSettings {
	appURL := strings.TrimRight(strings.TrimSpace(cfgAppURL), "/")
	apiURL := strings.TrimRight(strings.TrimSpace(cfgAPIURL), "/")

	if family.PublicAppURL != nil && strings.TrimSpace(*family.PublicAppURL) != "" {
		appURL = strings.TrimRight(strings.TrimSpace(*family.PublicAppURL), "/")
	}
	if family.PublicAPIURL != nil && strings.TrimSpace(*family.PublicAPIURL) != "" {
		apiURL = strings.TrimRight(strings.TrimSpace(*family.PublicAPIURL), "/")
	}

	return publicAccessSettings{
		AppURL:                  appURL,
		APIURL:                  apiURL,
		ConfiguredAppURL:        family.PublicAppURL,
		ConfiguredAPIURL:        family.PublicAPIURL,
		EnvironmentAppURL:       cfgAppURL,
		EnvironmentAPIURL:       cfgAPIURL,
		InviteURLIncludesAPIURL: appURL != apiURL,
	}
}

func candidateAddresses() []string {
	candidates := make([]string, 0)
	addrs, _ := net.InterfaceAddrs()
	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok || ipNet.IP == nil || ipNet.IP.IsLoopback() {
			continue
		}
		ip := ipNet.IP.To4()
		if ip == nil {
			continue
		}
		text := ip.String()
		if strings.HasPrefix(text, "172.") || strings.HasPrefix(text, "169.254.") {
			continue
		}
		candidates = append(candidates, text)
	}
	sort.Strings(candidates)
	return candidates
}
