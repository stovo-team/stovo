package app

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	mediaPlaybackTokenType     = "audio_playback"
	mediaPlaybackTokenAudience = "stovo-media-playback"
)

var errInvalidMediaPlaybackToken = errors.New("invalid media playback token")

type mediaPlaybackClaims struct {
	UserID   string `json:"uid"`
	FamilyID string `json:"fid"`
	FileID   string `json:"file_id"`
	Type     string `json:"typ"`
	jwt.RegisteredClaims
}

func (s *Server) mintMediaPlaybackToken(userID, familyID, fileID string) (string, time.Time, error) {
	if userID == "" || familyID == "" || fileID == "" || s.cfg.MediaPlaybackTokenTTL <= 0 {
		return "", time.Time{}, errInvalidMediaPlaybackToken
	}

	now := time.Now().UTC()
	expiresAt := now.Add(s.cfg.MediaPlaybackTokenTTL)
	claims := mediaPlaybackClaims{
		UserID:   userID,
		FamilyID: familyID,
		FileID:   fileID,
		Type:     mediaPlaybackTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Audience:  jwt.ClaimStrings{mediaPlaybackTokenAudience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return "", time.Time{}, errInvalidMediaPlaybackToken
	}
	return raw, expiresAt, nil
}

func (s *Server) parseMediaPlaybackToken(raw, expectedFileID string) (*mediaPlaybackClaims, error) {
	if raw == "" || expectedFileID == "" {
		return nil, errInvalidMediaPlaybackToken
	}

	claims := &mediaPlaybackClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errInvalidMediaPlaybackToken
		}
		return []byte(s.cfg.JWTSecret), nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithAudience(mediaPlaybackTokenAudience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil || token == nil || !token.Valid {
		return nil, errInvalidMediaPlaybackToken
	}
	if claims.UserID == "" || claims.FamilyID == "" || claims.FileID == "" ||
		claims.Type != mediaPlaybackTokenType || claims.Subject != claims.UserID ||
		claims.FileID != expectedFileID || len(claims.Audience) != 1 ||
		claims.Audience[0] != mediaPlaybackTokenAudience || claims.ID == "" ||
		claims.ExpiresAt == nil || claims.IssuedAt == nil || claims.NotBefore == nil {
		return nil, errInvalidMediaPlaybackToken
	}
	return claims, nil
}
