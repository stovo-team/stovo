package app

import (
	"database/sql"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

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

	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if name != nil {
			if _, err := s.txExec(tx, `UPDATE families SET name = ?, updated_at = ? WHERE id = ?`, *name, nowString(), user.FamilyID); err != nil {
				return err
			}
		}
		if payload.StorageLimitMB != nil {
			if _, err := s.txExec(tx, `UPDATE families SET storage_limit_mb = ?, updated_at = ? WHERE id = ?`, *payload.StorageLimitMB, nowString(), user.FamilyID); err != nil {
				return err
			}
		}
		if payload.MinimizedChatLayout != nil {
			if _, err := s.txExec(tx, `UPDATE families SET minimized_chat_layout = ?, updated_at = ? WHERE id = ?`, *payload.MinimizedChatLayout, nowString(), user.FamilyID); err != nil {
				return err
			}
		}
		return nil
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

func (s *Server) handleGetMembers(w http.ResponseWriter, _ *http.Request, user userPublic) {
	rows, err := s.query(`
		SELECT id, family_id, username, display_name, role, is_active, public_key, profile_photo_file_id, created_at, last_seen_at
		FROM users
		WHERE family_id = ? AND is_active = 1
		ORDER BY created_at ASC
	`, user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load members")
		return
	}
	defer rows.Close()

	members := make([]userPublic, 0)
	for rows.Next() {
		var member userPublic
		var createdAt string
		var publicKey, profilePhotoFileID, lastSeen sql.NullString
		var active int
		if err := rows.Scan(
			&member.ID,
			&member.FamilyID,
			&member.Username,
			&member.DisplayName,
			&member.Role,
			&active,
			&publicKey,
			&profilePhotoFileID,
			&createdAt,
			&lastSeen,
		); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not load members")
			return
		}
		created := parseTime(createdAt)
		member.CreatedAt = &created
		member.LastSeenAt = timePtrFromNull(sql.NullTime{Time: parseTime(lastSeen.String), Valid: lastSeen.Valid})
		member.IsActive = active == 1
		member.PublicKey = stringPtrFromNull(publicKey)
		if profilePhotoFileID.Valid {
			if file, err := s.buildFilePublic(profilePhotoFileID.String, member.ID); err == nil && file.DeletedAt == nil {
				member.ProfilePhoto = &file
			}
		}
		members = append(members, member)
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

	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `UPDATE users SET role = ? WHERE id = ?`, payload.Role, target.ID)
		return err
	}); err != nil {
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

	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `UPDATE users SET is_active = 0 WHERE id = ?`, target.ID); err != nil {
			return err
		}
		return s.revokeUserSessions(r.Context(), tx, target.ID)
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
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			INSERT INTO invites (id, family_id, token_hash, role, expires_at, max_uses, used_count, created_by, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
		`, inviteID, user.FamilyID, tokenHash(s.cfg.InviteTokenSecret, rawToken), role, expiresAt.Format(time.RFC3339Nano), maxUses, user.ID, nowString())
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create invite")
		return
	}

	invite, err := s.getInviteByID(inviteID)
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
	invite, family, err := s.findInviteByToken(inviteTokenFromURL(r))
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

	invite, family, err := s.findInviteByToken(inviteTokenFromURL(r))
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

	familyChatID, err := s.familyChatID(family.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load family chat")
		return
	}

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			INSERT INTO users (id, family_id, username, password_hash, display_name, role, is_active, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?)
		`, userID, family.ID, payload.Username, passwordHash, payload.DisplayName, invite.Role, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			UPDATE invites SET used_count = used_count + 1 WHERE id = ?
		`, invite.ID); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO chat_members (chat_id, user_id, created_at)
			VALUES (?, ?, ?)
		`, familyChatID, userID, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO chat_preferences (chat_id, user_id)
			VALUES (?, ?)
		`, familyChatID, userID); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, ip_address)
			VALUES (?, ?, ?, ?, ?, ?)
		`, uuid.NewString(), userID, refreshHash, refreshExpires, now, s.getClientIP(r)); err != nil {
			return err
		}
		return nil
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
	invite, err := s.getInviteByID(inviteIDFromURL(r))
	if err != nil || invite.FamilyID != user.FamilyID {
		s.detail(w, http.StatusNotFound, "Invite not found")
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `UPDATE invites SET revoked_at = ? WHERE id = ?`, nowString(), invite.ID)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not revoke invite")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getInviteByID(inviteID string) (invitePublic, error) {
	row := s.queryRow(`
		SELECT id, family_id, role, expires_at, max_uses, used_count, created_by, created_at, revoked_at
		FROM invites
		WHERE id = ?
	`, inviteID)
	return scanInvite(row)
}

func (s *Server) findInviteByToken(rawToken string) (invitePublic, familyPublic, error) {
	hashed := tokenHash(s.cfg.InviteTokenSecret, rawToken)
	row := s.queryRow(`
		SELECT id, family_id, role, expires_at, max_uses, used_count, created_by, created_at, revoked_at
		FROM invites
		WHERE token_hash = ?
	`, hashed)
	invite, err := scanInvite(row)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	if invite.RevokedAt != nil || invite.UsedCount >= invite.MaxUses || invite.ExpiresAt.Before(time.Now()) {
		return invitePublic{}, familyPublic{}, errNotFound
	}
	family, err := s.getFamily(invite.FamilyID)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	return invite, family, nil
}

func (s *Server) familyChatID(familyID string) (string, error) {
	row := s.queryRow(`SELECT id FROM chats WHERE family_id = ? AND type = 'family' LIMIT 1`, familyID)
	var chatID string
	if err := row.Scan(&chatID); err != nil {
		return "", err
	}
	return chatID, nil
}

func scanInvite(row *sql.Row) (invitePublic, error) {
	var invite invitePublic
	var expiresAt, createdAt string
	var revokedAt sql.NullString
	if err := row.Scan(
		&invite.ID,
		&invite.FamilyID,
		&invite.Role,
		&expiresAt,
		&invite.MaxUses,
		&invite.UsedCount,
		&invite.CreatedBy,
		&createdAt,
		&revokedAt,
	); err != nil {
		return invitePublic{}, err
	}
	invite.ExpiresAt = parseTime(expiresAt)
	invite.CreatedAt = parseTime(createdAt)
	if revokedAt.Valid {
		revoked := parseTime(revokedAt.String)
		invite.RevokedAt = &revoked
	}
	return invite, nil
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
