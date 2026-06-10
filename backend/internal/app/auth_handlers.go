package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"family-messenger/backend/internal/cache"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	s.json(w, http.StatusOK, map[string]string{
		"status":      "ok",
		"service":     s.cfg.AppName,
		"environment": s.cfg.AppEnv,
		"version":     s.cfg.AppVersion,
	})
}

func (s *Server) handleHealthDB(w http.ResponseWriter, _ *http.Request) {
	row := s.queryRow(`SELECT 1`)
	var value int
	if err := row.Scan(&value); err != nil {
		s.detail(w, http.StatusServiceUnavailable, "PostgreSQL health check failed")
		return
	}
	s.json(w, http.StatusOK, map[string]string{"status": "ok", "service": "postgres"})
}

func (s *Server) handleHealthRedis(w http.ResponseWriter, _ *http.Request) {
	if err := s.redis.Ping(context.Background()).Err(); err != nil {
		s.detail(w, http.StatusServiceUnavailable, "Redis health check failed")
		return
	}
	s.json(w, http.StatusOK, map[string]string{"status": "ok", "service": "redis"})
}

func (s *Server) handleSetupStatus(w http.ResponseWriter, _ *http.Request) {
	var count int
	if err := s.queryRow(`SELECT COUNT(*) FROM users WHERE is_active = 1`).Scan(&count); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load setup status")
		return
	}
	required := count == 0
	s.json(w, http.StatusOK, setupStatusResponse{
		SetupRequired: required,
		SetupComplete: !required,
	})
}

func (s *Server) handleSetup(w http.ResponseWriter, r *http.Request) {
	var payload setupRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	payload.FamilyName = strings.TrimSpace(payload.FamilyName)
	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.Username = strings.TrimSpace(payload.Username)
	payload.DisplayName = strings.TrimSpace(payload.DisplayName)
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	applyNicknameRegistrationDefaults(&payload.FamilyName, &payload.Email, &payload.Username, &payload.DisplayName, payload.Nickname)
	if payload.FamilyName == "" || payload.Username == "" || payload.DisplayName == "" || len(payload.Password) < 8 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid setup payload")
		return
	}

	var setupCount int
	if err := s.queryRow(`SELECT COUNT(*) FROM users WHERE is_active = 1`).Scan(&setupCount); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not verify setup status")
		return
	}
	if setupCount > 0 {
		s.detail(w, http.StatusConflict, "Setup already completed")
		return
	}

	passwordHash, err := hashPassword(payload.Password)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not hash password")
		return
	}

	familyID := uuid.NewString()
	userID := uuid.NewString()
	chatID := uuid.NewString()
	if payload.Email == "" {
		payload.Email = generatedAccountEmail(userID)
	}
	now := nowString()
	token, tokenHash, expiresAt, err := s.issueRefreshToken(userID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create session")
		return
	}

	err = s.withTx(r.Context(), func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `
			INSERT INTO families (id, name, created_at, updated_at)
			VALUES (?, ?, ?, ?)
		`, familyID, payload.FamilyName, now, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO users (id, family_id, email, username, password_hash, display_name, role, is_active, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
		`, userID, familyID, payload.Email, payload.Username, passwordHash, payload.DisplayName, ownerRole, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO chats (id, family_id, type, title, created_by, media_visibility, encryption_protocol, created_at, updated_at)
			VALUES (?, ?, 'family', ?, ?, 'family', 'end_to_end', ?, ?)
		`, chatID, familyID, "General Family Chat", userID, now, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO chat_members (chat_id, user_id, created_at)
			VALUES (?, ?, ?)
		`, chatID, userID, now); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO chat_preferences (chat_id, user_id)
			VALUES (?, ?)
		`, chatID, userID); err != nil {
			return err
		}
		if _, err := s.txExec(tx, `
			INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, ip_address)
			VALUES (?, ?, ?, ?, ?, ?)
		`, uuid.NewString(), userID, tokenHash, expiresAt, now, s.getClientIP(r)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			s.detail(w, http.StatusConflict, "Email or username already exists")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Could not complete setup")
		return
	}

	user, err := s.getUserByID(userID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load user")
		return
	}
	accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}

	s.setRefreshCookie(w, token)
	s.json(w, http.StatusCreated, authResponse{
		AccessToken:      accessToken,
		TokenType:        "Bearer",
		ExpiresInSeconds: expiresInSeconds,
		User:             user,
		RefreshToken:     token,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var payload loginRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	clientIP := s.getClientIP(r)
	if _, err := cache.NewRateLimitService(s.cache).CheckLogin(r.Context(), clientIP); err != nil {
		var limitErr cache.RateLimitExceededError
		if errors.As(err, &limitErr) {
			s.detail(w, http.StatusTooManyRequests, "Rate limit exceeded")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Could not verify rate limit")
		return
	}

	user, passwordHash, err := s.getUserForLogin(strings.TrimSpace(payload.Login))
	if err != nil || !verifyPassword(payload.Password, passwordHash) || !user.IsActive {
		s.detail(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	token, tokenHash, expiresAt, err := s.issueRefreshToken(user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `
			INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, ip_address)
			VALUES (?, ?, ?, ?, ?, ?)
		`, uuid.NewString(), user.ID, tokenHash, expiresAt, nowString(), clientIP)
		return err
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save session")
		return
	}

	accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}

	s.setRefreshCookie(w, token)
	s.json(w, http.StatusOK, authResponse{
		AccessToken:      accessToken,
		TokenType:        "Bearer",
		ExpiresInSeconds: expiresInSeconds,
		User:             user,
		RefreshToken:     token,
	})
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	// Accept the refresh token from the cookie (same-origin web) or from the
	// X-Refresh-Token header (cross-origin Capacitor Android clients).
	rawToken := ""
	if cookie, err := r.Cookie(s.cfg.RefreshCookieName); err == nil {
		rawToken = strings.TrimSpace(cookie.Value)
	}
	if rawToken == "" {
		rawToken = strings.TrimSpace(r.Header.Get("X-Refresh-Token"))
	}
	if rawToken == "" {
		s.detail(w, http.StatusUnauthorized, "Refresh token is missing")
		return
	}

	user, nextToken, err := s.rotateRefreshToken(r.Context(), rawToken, s.getClientIP(r))
	if err != nil {
		s.clearRefreshCookie(w)
		s.detail(w, http.StatusUnauthorized, "Invalid refresh token")
		return
	}

	accessToken, expiresInSeconds, err := createAccessToken(s.cfg, user)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create access token")
		return
	}

	s.setRefreshCookie(w, nextToken)
	s.json(w, http.StatusOK, authResponse{
		AccessToken:      accessToken,
		TokenType:        "Bearer",
		ExpiresInSeconds: expiresInSeconds,
		User:             user,
		RefreshToken:     nextToken,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	rawToken := ""
	if cookie, err := r.Cookie(s.cfg.RefreshCookieName); err == nil {
		rawToken = strings.TrimSpace(cookie.Value)
	}
	if rawToken == "" {
		rawToken = strings.TrimSpace(r.Header.Get("X-Refresh-Token"))
	}
	if rawToken != "" {
		_ = s.revokeRefreshToken(r.Context(), rawToken)
	}
	s.clearRefreshCookie(w)
	s.json(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleMe(w http.ResponseWriter, _ *http.Request, user userPublic) {
	s.json(w, http.StatusOK, user)
}

func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload updateMeRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	displayName := trimStringPointer(payload.DisplayName)
	publicKey := trimStringPointer(payload.PublicKey)
	profilePhotoFileID := trimStringPointer(payload.ProfilePhotoFileID)
	if displayName == nil && publicKey == nil && profilePhotoFileID == nil {
		s.detail(w, http.StatusUnprocessableEntity, "displayName, publicKey, or profilePhotoFileId is required")
		return
	}
	if displayName != nil && *displayName == "" {
		s.detail(w, http.StatusUnprocessableEntity, "displayName cannot be blank")
		return
	}
	if profilePhotoFileID != nil && *profilePhotoFileID != "" {
		if err := s.validateImageFileForFamily(*profilePhotoFileID, user, "Profile photo not found"); err != nil {
			s.detail(w, domainErrorStatus(err), err.Error())
			return
		}
	}

	if err := s.withTx(r.Context(), func(tx *sql.Tx) error {
		if displayName != nil {
			if _, err := s.txExec(tx, `UPDATE users SET display_name = ? WHERE id = ?`, *displayName, user.ID); err != nil {
				return err
			}
		}
		if publicKey != nil {
			if _, err := s.txExec(tx, `UPDATE users SET public_key = ? WHERE id = ?`, *publicKey, user.ID); err != nil {
				return err
			}
		}
		if profilePhotoFileID != nil {
			if *profilePhotoFileID == "" {
				if _, err := s.txExec(tx, `UPDATE users SET profile_photo_file_id = NULL WHERE id = ?`, user.ID); err != nil {
					return err
				}
			} else if _, err := s.txExec(tx, `UPDATE users SET profile_photo_file_id = ? WHERE id = ?`, *profilePhotoFileID, user.ID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update profile")
		return
	}

	updated, err := s.getUserByID(user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load profile")
		return
	}
	s.json(w, http.StatusOK, updated)
}

func (s *Server) getUserForLogin(login string) (userPublic, string, error) {
	row := s.queryRow(`
		SELECT id, family_id, email, username, display_name, role, is_active, public_key, profile_photo_file_id, created_at, last_seen_at, password_hash
		FROM users
		WHERE lower(email) = lower(?) OR lower(username) = lower(?)
		LIMIT 1
	`, login, login)

	var user userPublic
	var createdAt string
	var publicKey, profilePhotoFileID, lastSeen sql.NullString
	var active int
	var passwordHash string
	if err := row.Scan(
		&user.ID,
		&user.FamilyID,
		&user.Email,
		&user.Username,
		&user.DisplayName,
		&user.Role,
		&active,
		&publicKey,
		&profilePhotoFileID,
		&createdAt,
		&lastSeen,
		&passwordHash,
	); err != nil {
		return userPublic{}, "", err
	}
	created := parseTime(createdAt)
	user.IsActive = active == 1
	user.PublicKey = stringPtrFromNull(publicKey)
	if profilePhotoFileID.Valid {
		if file, err := s.buildFilePublic(profilePhotoFileID.String, user.ID); err == nil && file.DeletedAt == nil {
			user.ProfilePhoto = &file
		}
	}
	user.CreatedAt = &created
	user.LastSeenAt = timePtrFromNull(sql.NullTime{Time: parseTime(lastSeen.String), Valid: lastSeen.Valid})
	return user, passwordHash, nil
}

func (s *Server) issueRefreshToken(userID string) (raw string, hashed string, expiresAt string, err error) {
	raw, err = randomToken()
	if err != nil {
		return "", "", "", err
	}
	return raw, tokenHash(s.cfg.RefreshTokenSecret, raw), time.Now().Add(s.cfg.RefreshTokenTTL).UTC().Format(time.RFC3339Nano), nil
}

func (s *Server) rotateRefreshToken(ctx context.Context, rawToken string, ip string) (userPublic, string, error) {
	hashed := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	row := s.db.QueryRowContext(ctx, s.rebind(`
		SELECT user_id, expires_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = ?
	`), hashed)

	var userID string
	var expiresAt string
	var revokedAt sql.NullString
	if err := row.Scan(&userID, &expiresAt, &revokedAt); err != nil {
		return userPublic{}, "", errUnauthorized
	}
	if revokedAt.Valid || parseTime(expiresAt).Before(time.Now()) {
		return userPublic{}, "", errUnauthorized
	}

	nextRaw, nextHash, nextExpires, err := s.issueRefreshToken(userID)
	if err != nil {
		return userPublic{}, "", err
	}

	if err := s.withTx(ctx, func(tx *sql.Tx) error {
		if _, err := s.txExec(tx, `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`, nowString(), hashed); err != nil {
			return err
		}
		_, err := s.txExec(tx, `
			INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at, ip_address)
			VALUES (?, ?, ?, ?, ?, ?)
		`, uuid.NewString(), userID, nextHash, nextExpires, nowString(), ip)
		return err
	}); err != nil {
		return userPublic{}, "", err
	}

	user, err := s.getUserByID(userID)
	if err != nil || !user.IsActive {
		return userPublic{}, "", errUnauthorized
	}

	return user, nextRaw, nil
}

func (s *Server) revokeRefreshToken(ctx context.Context, rawToken string) error {
	hashed := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	return s.withTx(ctx, func(tx *sql.Tx) error {
		_, err := s.txExec(tx, `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE token_hash = ?`, nowString(), hashed)
		return err
	})
}

func (s *Server) revokeUserSessions(ctx context.Context, tx *sql.Tx, userID string) error {
	_, err := s.txExec(tx, `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?`, nowString(), userID)
	return err
}

func applyNicknameRegistrationDefaults(familyName *string, email *string, username *string, displayName *string, nickname string) {
	nickname = strings.TrimSpace(nickname)
	if username != nil && strings.TrimSpace(*username) == "" {
		if nickname != "" {
			*username = nickname
		} else if displayName != nil {
			*username = strings.TrimSpace(*displayName)
		}
	}
	if displayName != nil && strings.TrimSpace(*displayName) == "" {
		if nickname != "" {
			*displayName = nickname
		} else if username != nil {
			*displayName = strings.TrimSpace(*username)
		}
	}
	if familyName != nil && strings.TrimSpace(*familyName) == "" {
		name := "Family"
		if displayName != nil && strings.TrimSpace(*displayName) != "" {
			name = strings.TrimSpace(*displayName) + "'s Family"
		}
		*familyName = name
	}
	if email != nil {
		*email = strings.TrimSpace(strings.ToLower(*email))
	}
	if username != nil {
		*username = strings.TrimSpace(*username)
	}
	if displayName != nil {
		*displayName = strings.TrimSpace(*displayName)
	}
}

func generatedAccountEmail(userID string) string {
	return strings.ToLower(userID) + "@users.family-messenger.invalid"
}

func chatIDFromURL(r *http.Request) string {
	return chi.URLParam(r, "chatId")
}

func fileIDFromURL(r *http.Request) string {
	return chi.URLParam(r, "fileId")
}

func messageIDFromURL(r *http.Request) string {
	return chi.URLParam(r, "messageId")
}

func userIDFromURL(r *http.Request) string {
	return chi.URLParam(r, "userId")
}

func inviteIDFromURL(r *http.Request) string {
	return chi.URLParam(r, "inviteId")
}

func inviteTokenFromURL(r *http.Request) string {
	return chi.URLParam(r, "token")
}

func domainErrorStatus(err error) int {
	var httpErr statusError
	if errors.As(err, &httpErr) {
		return httpErr.Status
	}
	switch {
	case errors.Is(err, errForbidden):
		return http.StatusForbidden
	case errors.Is(err, errUnauthorized):
		return http.StatusUnauthorized
	case isMissing(err):
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

func defaultAudioSettings() audioCallSettings {
	return audioCallSettings{
		SpeakerMode:               "small",
		InputDeviceID:             "",
		OutputDeviceID:            "",
		EchoCancellation:          true,
		NoiseSuppression:          true,
		AutoGainControl:           true,
		VoiceEnhancement:          false,
		InputGain:                 100,
		OutputVolume:              80,
		VoiceEnhancementThreshold: -24,
		VoiceEnhancementHighpass:  120,
	}
}

func (s *Server) handleGetAudioSettings(w http.ResponseWriter, _ *http.Request, user userPublic) {
	var raw sql.NullString
	err := s.queryRow(`SELECT audio_call_settings FROM users WHERE id = ?`, user.ID).Scan(&raw)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load audio settings")
		return
	}
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		s.json(w, http.StatusOK, defaultAudioSettings())
		return
	}
	var settings audioCallSettings
	if err := json.Unmarshal([]byte(raw.String), &settings); err != nil {
		s.json(w, http.StatusOK, defaultAudioSettings())
		return
	}
	s.json(w, http.StatusOK, settings)
}

func (s *Server) handleGetNotificationTopic(w http.ResponseWriter, _ *http.Request, user userPublic) {
	var tokenStr string
	row := s.queryRow(`SELECT ntfy_topic_token FROM users WHERE id = ?`, user.ID)
	var token sql.NullString
	if err := row.Scan(&token); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load notification topic")
		return
	}
	if token.Valid && token.String != "" {
		tokenStr = token.String
	} else {
		tokenStr = "stovo-user-" + uuid.NewString()
		if _, err := s.exec(
			`UPDATE users SET ntfy_topic_token = ? WHERE id = ?`,
			tokenStr, user.ID,
		); err != nil {
			s.detail(w, http.StatusInternalServerError, "Could not persist notification topic")
			return
		}
	}
	ntfyPublicURL := s.cfg.AppURL + "/ntfy"
	s.json(w, http.StatusOK, map[string]string{
		"topic":       tokenStr,
		"ntfyBaseUrl": ntfyPublicURL,
	})
}

func (s *Server) handlePutAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	var payload updateAudioSettingsRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	// Clamp ranges
	if payload.InputGain < 0 {
		payload.InputGain = 0
	} else if payload.InputGain > 200 {
		payload.InputGain = 200
	}
	if payload.OutputVolume < 0 {
		payload.OutputVolume = 0
	} else if payload.OutputVolume > 100 {
		payload.OutputVolume = 100
	}
	if payload.VoiceEnhancementThreshold < -50 {
		payload.VoiceEnhancementThreshold = -50
	} else if payload.VoiceEnhancementThreshold > 0 {
		payload.VoiceEnhancementThreshold = 0
	}
	if payload.VoiceEnhancementHighpass < 60 {
		payload.VoiceEnhancementHighpass = 60
	} else if payload.VoiceEnhancementHighpass > 300 {
		payload.VoiceEnhancementHighpass = 300
	}
	if payload.SpeakerMode != "small" && payload.SpeakerMode != "large" {
		payload.SpeakerMode = "small"
	}

	blob, err := json.Marshal(payload)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not encode audio settings")
		return
	}

	if _, err := s.exec(`UPDATE users SET audio_call_settings = ? WHERE id = ?`, string(blob), user.ID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save audio settings")
		return
	}

	s.json(w, http.StatusOK, payload)
}
