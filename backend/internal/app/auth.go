package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"stovo-messenger/backend/internal/features/identity"
	featurepreferences "stovo-messenger/backend/internal/features/preferences"
	transporthttp "stovo-messenger/backend/internal/transport/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const deviceLoginCodeTTLSeconds = 10 * 60

func deviceLoginCacheKey(userID string) string { return "device-login:" + userID }

func newDeviceLoginCode() (string, error) {
	var value uint32
	if err := binary.Read(rand.Reader, binary.BigEndian, &value); err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value%1000000), nil
}

func deviceLoginCodeHash(code string) string {
	sum := sha256.Sum256([]byte(code))
	return fmt.Sprintf("%x", sum[:])
}

// processSetup is the outer identity adapter invoked by the HTTP transport.
// Decoding, normalization and public validation belong to SetupHandler.
func (s *Server) processSetup(ctx context.Context, payload transporthttp.SetupRequest, clientIP string) (any, int, string) {
	setupStatus, err := s.setupStatus.Load(ctx)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not verify setup status"
	}
	validInvite := s.validateAdminInviteToken(payload.InviteToken)
	if setupStatus.ActiveUserCount > 0 && !validInvite {
		return nil, http.StatusConflict, "Setup already completed"
	}
	passwordHash, err := hashPassword(payload.Password)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not hash password"
	}
	userID := uuid.NewString()
	token, tokenHash, expiresAt, err := s.issueRefreshToken(userID)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not create session"
	}
	command := identity.SetupCommand{FamilyName: payload.FamilyName, UserID: userID, Username: payload.Username, PasswordHash: passwordHash, DisplayName: payload.DisplayName, Role: ownerRole, ChatID: uuid.NewString(), RefreshTokenID: uuid.NewString(), TokenHash: tokenHash, ExpiresAt: expiresAt, CreatedAt: nowString(), IPAddress: clientIP}
	status := http.StatusCreated
	if setupStatus.ActiveUserCount > 0 {
		if err = s.setup.CreateAdmin(ctx, command); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				return nil, http.StatusConflict, "Username already exists"
			}
			return nil, http.StatusInternalServerError, "Could not create admin account"
		}
		status = http.StatusOK
	} else {
		command.FamilyID, command.ChatTitle = uuid.NewString(), "General Family Chat"
		if err = s.setup.CompleteInitial(ctx, command); err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				return nil, http.StatusConflict, "Username already exists"
			}
			return nil, http.StatusInternalServerError, "Could not complete setup"
		}
	}
	user, err := s.getUserByID(userID)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not load user profile"
	}
	accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
	if err != nil {
		return nil, http.StatusInternalServerError, "Could not create access token"
	}
	return transporthttp.AuthSuccess[userPublic]{AccessToken: accessToken, TokenType: "Bearer", ExpiresInSeconds: expiresInSeconds, User: user, RefreshToken: token}, status, ""
}

// validateAdminInviteToken returns true if the given JWT is a valid admin_invite
// token signed with the master system secret.
func (s *Server) validateAdminInviteToken(token string) bool {
	if token == "" {
		return false
	}
	masterSecret := []byte(os.Getenv("MASTER_SYSTEM_SECRET"))
	if len(masterSecret) == 0 {
		masterSecret = []byte(os.Getenv("JWT_SECRET"))
	}
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		return masterSecret, nil
	})
	if err != nil || !parsed.Valid {
		return false
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	return ok && claims["type"] == "admin_invite"
}

func (s *Server) updateProfileForUser(ctx context.Context, user userPublic, payload transporthttp.ProfileUpdateRequest) (any, error) {
	params := identity.ProfilePatch{
		DisplayName:         payload.DisplayName,
		PublicKey:           payload.PublicKey,
		ProfileVisibility:   payload.ProfileVisibility,
		LastSeenVisibility:  payload.LastSeenVisibility,
		ReadReceiptsEnabled: payload.ReadReceiptsEnabled,
		Email:               payload.Email,
		Bio:                 payload.Bio,
		Timezone:            payload.Timezone,
		AvatarMode:          payload.AvatarMode,
		AvatarSymbolID:      payload.AvatarSymbolID,
		AvatarColorID:       payload.AvatarColorID,
	}
	if payload.ProfilePhotoFileID != nil {
		if *payload.ProfilePhotoFileID == "" {
			params.ClearProfilePhoto = true
		} else {
			params.ProfilePhotoFileID = payload.ProfilePhotoFileID
		}
	}
	if err := s.profile.Update(ctx, user.ID, params); err != nil {
		return nil, err
	}
	privacyPatch := featurepreferences.ContactPrivacyPatch{DirectMessagePermission: payload.DirectMessagePermission, GroupInvitePermission: payload.GroupInvitePermission, ChannelInvitePermission: payload.ChannelInvitePermission, VoiceInvitePermission: payload.VoiceInvitePermission, InvitePermissionUserIDs: payload.InvitePermissionUserIDs}
	if err := s.preferences.SaveContactPrivacy(ctx, user.ID, privacyPatch); err != nil {
		return nil, err
	}
	updated, err := s.getUserByID(user.ID)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (s *Server) changePasswordForUser(ctx context.Context, user userPublic, payload transporthttp.PasswordChangeRequest, rawToken string) (int, string, error) {
	validationErr := identity.ValidatePasswordChange(payload.CurrentPassword, payload.NewPassword)
	if errors.Is(validationErr, identity.ErrPasswordTooShort) {
		return http.StatusUnprocessableEntity, "New password must be at least 8 characters", validationErr
	}
	if errors.Is(validationErr, identity.ErrPasswordUnchanged) {
		return http.StatusUnprocessableEntity, "New password must be different from the current password", validationErr
	}
	currentUser, currentPasswordHash, err := s.getUserForLogin(ctx, user.Username)
	if err != nil || currentUser.ID != user.ID || !verifyPassword(payload.CurrentPassword, currentPasswordHash) {
		return http.StatusUnauthorized, "Current password is incorrect", fmt.Errorf("current password")
	}
	if rawToken == "" {
		return http.StatusUnauthorized, "Current session is missing", fmt.Errorf("session missing")
	}
	currentTokenHash := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	currentSession, err := s.sessionWriter.SessionByHash(ctx, currentTokenHash)
	if err != nil || currentSession.UserID != user.ID || errors.Is(identity.ValidateRefreshSession(currentSession, time.Now()), identity.ErrInvalidSession) {
		return http.StatusUnauthorized, "Current session is invalid", fmt.Errorf("session invalid")
	}
	newPasswordHash, err := hashPassword(payload.NewPassword)
	if err != nil {
		return http.StatusInternalServerError, "Could not secure new password", err
	}
	if err := s.sessionWriter.ChangePassword(ctx, identity.PasswordChange{UserID: user.ID, PasswordHash: newPasswordHash, CurrentTokenHash: currentTokenHash, RevokedAt: nowString()}); err != nil {
		return http.StatusInternalServerError, "Could not change password", err
	}
	return 0, "", nil
}

func (s *Server) getUserForLogin(ctx context.Context, username string) (userPublic, string, error) {
	account, err := s.loginAccounts.ByUsername(ctx, username)
	if err != nil {
		return userPublic{}, "", err
	}
	user := s.userPublicFromLoginAccount(account)
	user.RoleID, _ = s.roles.UserRoleID(ctx, account.ID)
	s.hydrateUserRole(ctx, &user)
	return user, account.PasswordHash, nil
}

func (s *Server) userPublicFromLoginAccount(account identity.LoginAccount) userPublic {
	user := userPublic{
		ID: account.ID, FamilyID: account.FamilyID, Username: account.Username,
		DisplayName: account.DisplayName, Role: account.Role, IsActive: account.IsActive,
		PublicKey: account.PublicKey, ProfileVisibility: account.ProfileVisibility,
		LastSeenVisibility: account.LastSeenVisibility, ReadReceiptsEnabled: account.ReadReceiptsEnabled,
		DirectMessagePermission: "family", GroupInvitePermission: "allow",
		ChannelInvitePermission: "allow", VoiceInvitePermission: "allow",
		Email: account.Email, Bio: account.Bio, Timezone: account.Timezone,
	}
	created := parseTime(account.CreatedAt)
	user.CreatedAt = &created
	if account.LastSeenAt != nil {
		lastSeen := parseTime(*account.LastSeenAt)
		user.LastSeenAt = &lastSeen
	}
	if account.ProfilePhotoFileID != nil {
		if file, err := s.buildFilePublic(*account.ProfilePhotoFileID, user.ID); err == nil && file.DeletedAt == nil {
			user.ProfilePhoto = &file
		}
	}
	if account.AudioCallSettings != nil {
		var settings audioCallSettings
		if json.Unmarshal([]byte(*account.AudioCallSettings), &settings) == nil && settings.Privacy != nil {
			user.DirectMessagePermission = settings.Privacy.DirectMessagePermission
			user.GroupInvitePermission = settings.Privacy.GroupInvitePermission
			user.ChannelInvitePermission = settings.Privacy.ChannelInvitePermission
			user.VoiceInvitePermission = settings.Privacy.VoiceInvitePermission
			user.InvitePermissionUserIDs = settings.Privacy.InvitePermissionUserIDs
		}
	}
	return user
}

func (s *Server) issueRefreshToken(userID string) (raw string, hashed string, expiresAt string, err error) {
	token, err := identity.IssueSessionToken(randomToken, func(value string) string { return tokenHash(s.cfg.RefreshTokenSecret, value) }, time.Now(), s.cfg.RefreshTokenTTL)
	if err != nil {
		return "", "", "", err
	}
	return token.Raw, token.Hash, token.ExpiresAt, nil
}

func (s *Server) rotateRefreshToken(ctx context.Context, rawToken string, ip string) (userPublic, string, error) {
	hashed := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	token, err := s.sessionWriter.SessionByHash(ctx, hashed)
	if err != nil {
		return userPublic{}, "", errUnauthorized
	}
	if err := identity.ValidateRefreshSession(token, time.Now()); errors.Is(err, identity.ErrInvalidSession) {
		return userPublic{}, "", errUnauthorized
	}
	user, err := s.getUserByID(token.UserID)
	if err != nil || !user.IsActive {
		return userPublic{}, "", errUnauthorized
	}
	banned, err := s.isFamilyIPBanned(ctx, user.FamilyID, ip)
	if err != nil || banned {
		return userPublic{}, "", errUnauthorized
	}

	nextRaw, nextHash, nextExpires, err := s.issueRefreshToken(token.UserID)
	if err != nil {
		return userPublic{}, "", err
	}

	createdAt := nowString()
	if err := s.sessionWriter.RotateSession(ctx, identity.RotatedSession{OldTokenHash: hashed, New: identity.PersistedSession{ID: uuid.NewString(), UserID: token.UserID, TokenHash: nextHash, ExpiresAt: nextExpires, CreatedAt: createdAt, IPAddress: ip}, RevokedAt: createdAt}); err != nil {
		return userPublic{}, "", err
	}

	return user, nextRaw, nil
}

func (s *Server) revokeRefreshToken(ctx context.Context, rawToken string) error {
	hashed := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	return s.sessionWriter.RevokeSession(ctx, hashed, nowString())
}
