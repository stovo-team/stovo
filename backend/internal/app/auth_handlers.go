package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/cache"
	"family-messenger/backend/internal/repository"

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

func (s *Server) handleHealthDB(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
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

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	count, err := s.store.CountActiveUsers(r.Context())
	if err != nil {
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
	payload.Username = strings.TrimSpace(payload.Username)
	payload.DisplayName = strings.TrimSpace(payload.DisplayName)
	payload.Nickname = strings.TrimSpace(payload.Nickname)
	applyNicknameRegistrationDefaults(&payload.FamilyName, &payload.Username, &payload.DisplayName, payload.Nickname)
	if payload.FamilyName == "" || payload.Username == "" || payload.DisplayName == "" || len(payload.Password) < 8 {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid setup payload")
		return
	}

	setupCount, err := s.store.CountActiveUsers(r.Context())
	if err != nil {
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
	now := nowString()
	token, tokenHash, expiresAt, err := s.issueRefreshToken(userID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create session")
		return
	}

	err = s.store.CompleteSetup(r.Context(), repository.SetupParams{
		FamilyID:       familyID,
		FamilyName:     payload.FamilyName,
		UserID:         userID,
		Username:       payload.Username,
		PasswordHash:   passwordHash,
		DisplayName:    payload.DisplayName,
		Role:           ownerRole,
		ChatID:         chatID,
		ChatTitle:      "General Family Chat",
		RefreshTokenID: uuid.NewString(),
		TokenHash:      tokenHash,
		ExpiresAt:      expiresAt,
		CreatedAt:      now,
		IPAddress:      s.getClientIP(r),
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			s.detail(w, http.StatusConflict, "Username already exists")
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

	user, passwordHash, err := s.getUserForLogin(r.Context(), strings.TrimSpace(payload.Username))
	if err != nil || !verifyPassword(payload.Password, passwordHash) || !user.IsActive {
		s.detail(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}

	token, tokenHash, expiresAt, err := s.issueRefreshToken(user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not create session")
		return
	}
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		return s.store.CreateRefreshToken(r.Context(), tx, repository.CreateRefreshTokenParams{
			ID:        uuid.NewString(),
			UserID:    user.ID,
			TokenHash: tokenHash,
			ExpiresAt: expiresAt,
			CreatedAt: nowString(),
			IPAddress: clientIP,
		})
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
	if displayName == nil && publicKey == nil && profilePhotoFileID == nil && payload.ProfileVisibility == nil && payload.LastSeenVisibility == nil && payload.ReadReceiptsEnabled == nil {
		s.detail(w, http.StatusUnprocessableEntity, "A profile or privacy setting is required")
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
	for _, value := range []*string{payload.ProfileVisibility, payload.LastSeenVisibility} {
		if value != nil && *value != "family" && *value != "nobody" {
			s.detail(w, http.StatusUnprocessableEntity, "Visibility must be family or nobody")
			return
		}
	}

	params := repository.UpdateUserProfileParams{
		DisplayName:         displayName,
		PublicKey:           publicKey,
		ProfileVisibility:   payload.ProfileVisibility,
		LastSeenVisibility:  payload.LastSeenVisibility,
		ReadReceiptsEnabled: payload.ReadReceiptsEnabled,
	}
	if profilePhotoFileID != nil {
		if *profilePhotoFileID == "" {
			params.ClearProfilePhoto = true
		} else {
			params.ProfilePhotoFileID = profilePhotoFileID
		}
	}
	if err := s.store.UpdateUserProfile(r.Context(), user.ID, params); err != nil {
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

func (s *Server) getUserForLogin(ctx context.Context, username string) (userPublic, string, error) {
	u, err := s.store.UserByUsernameFold(ctx, username)
	if err != nil {
		return userPublic{}, "", err
	}
	return s.userPublicFromEnt(u), u.PasswordHash, nil
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
	token, err := s.store.RefreshTokenByHash(ctx, hashed)
	if err != nil {
		return userPublic{}, "", errUnauthorized
	}
	if token.RevokedAt != nil || parseTime(token.ExpiresAt).Before(time.Now()) {
		return userPublic{}, "", errUnauthorized
	}

	nextRaw, nextHash, nextExpires, err := s.issueRefreshToken(token.UserID)
	if err != nil {
		return userPublic{}, "", err
	}

	if err := s.store.RotateRefreshToken(ctx, repository.RotateRefreshTokenParams{
		OldTokenHash: hashed,
		NewID:        uuid.NewString(),
		UserID:       token.UserID,
		NewTokenHash: nextHash,
		NewExpiresAt: nextExpires,
		CreatedAt:    nowString(),
		IPAddress:    ip,
		RevokedAt:    nowString(),
	}); err != nil {
		return userPublic{}, "", err
	}

	user, err := s.getUserByID(token.UserID)
	if err != nil || !user.IsActive {
		return userPublic{}, "", errUnauthorized
	}

	return user, nextRaw, nil
}

func (s *Server) revokeRefreshToken(ctx context.Context, rawToken string) error {
	hashed := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	return s.store.RevokeRefreshTokenByHash(ctx, hashed, nowString())
}

func applyNicknameRegistrationDefaults(familyName *string, username *string, displayName *string, nickname string) {
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
	if username != nil {
		*username = strings.TrimSpace(*username)
	}
	if displayName != nil {
		*displayName = strings.TrimSpace(*displayName)
	}
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

func (s *Server) handleGetAudioSettings(w http.ResponseWriter, r *http.Request, user userPublic) {
	raw, err := s.store.AudioCallSettings(r.Context(), user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load audio settings")
		return
	}
	if raw == nil || strings.TrimSpace(*raw) == "" {
		s.json(w, http.StatusOK, defaultAudioSettings())
		return
	}
	var settings audioCallSettings
	if err := json.Unmarshal([]byte(*raw), &settings); err != nil {
		s.json(w, http.StatusOK, defaultAudioSettings())
		return
	}
	s.json(w, http.StatusOK, settings)
}

func (s *Server) handleGetNotificationTopic(w http.ResponseWriter, r *http.Request, user userPublic) {
	token, err := s.store.NtfyTopicToken(r.Context(), user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load notification topic")
		return
	}
	tokenStr := ""
	if token != nil && *token != "" {
		tokenStr = *token
	} else {
		tokenStr = "stovo-user-" + uuid.NewString()
		if err := s.store.SetNtfyTopicToken(r.Context(), user.ID, tokenStr); err != nil {
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

	if err := s.store.SetAudioCallSettings(r.Context(), user.ID, string(blob)); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not save audio settings")
		return
	}

	s.json(w, http.StatusOK, payload)
}
