package app

import (
	"testing"
	"time"

	"family-messenger/backend/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

func TestMediaPlaybackTokenMintAndParse(t *testing.T) {
	server := &Server{cfg: config.Config{
		JWTSecret:             "media-playback-test-secret",
		MediaPlaybackTokenTTL: 12 * time.Hour,
	}}
	before := time.Now()
	token, expiresAt, err := server.mintMediaPlaybackToken("user-1", "family-1", "file-1")
	if err != nil {
		t.Fatalf("mint playback token: %v", err)
	}
	after := time.Now()

	claims, err := server.parseMediaPlaybackToken(token, "file-1")
	if err != nil {
		t.Fatalf("parse playback token: %v", err)
	}
	if claims.UserID != "user-1" || claims.FamilyID != "family-1" || claims.FileID != "file-1" {
		t.Fatalf("unexpected playback scope: user=%q family=%q file=%q", claims.UserID, claims.FamilyID, claims.FileID)
	}
	if claims.Type != mediaPlaybackTokenType {
		t.Fatalf("type = %q, want %q", claims.Type, mediaPlaybackTokenType)
	}
	if claims.Subject != "user-1" {
		t.Fatalf("subject = %q, want user-1", claims.Subject)
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != mediaPlaybackTokenAudience {
		t.Fatalf("audience = %#v", claims.Audience)
	}
	if claims.ID == "" {
		t.Fatal("token ID is empty")
	}
	if claims.IssuedAt == nil || claims.NotBefore == nil || claims.ExpiresAt == nil {
		t.Fatal("registered time claims must all be present")
	}
	if claims.IssuedAt.Time.Before(before.Add(-time.Second)) || claims.IssuedAt.Time.After(after.Add(time.Second)) {
		t.Fatalf("issued-at is outside mint window: %s", claims.IssuedAt.Time)
	}
	if claims.NotBefore.Time.Before(before.Add(-time.Second)) || claims.NotBefore.Time.After(after.Add(time.Second)) {
		t.Fatalf("not-before is outside mint window: %s", claims.NotBefore.Time)
	}
	if expiresAt.Before(before.Add(12*time.Hour-time.Second)) || expiresAt.After(after.Add(12*time.Hour+time.Second)) {
		t.Fatalf("expiry is outside configured TTL window: %s", expiresAt)
	}
	if !claims.ExpiresAt.Time.Equal(expiresAt.Truncate(time.Second)) {
		t.Fatalf("claim expiry = %s, returned expiry = %s", claims.ExpiresAt.Time, expiresAt)
	}
}

func TestMediaPlaybackTokenRejectsInvalidScopeAndCredentials(t *testing.T) {
	server := &Server{cfg: config.Config{
		JWTSecret:             "media-playback-test-secret",
		MediaPlaybackTokenTTL: time.Hour,
	}}
	valid, _, err := server.mintMediaPlaybackToken("user-1", "family-1", "file-1")
	if err != nil {
		t.Fatalf("mint playback token: %v", err)
	}

	tests := map[string]string{
		"wrong file":       signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "file-2", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"wrong purpose":    signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "file-1", "access", mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"wrong audience":   signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "file-1", mediaPlaybackTokenType, "another-audience", time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"wrong algorithm":  signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "file-1", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS384),
		"different signer": signedMediaPlaybackTokenForTest(t, "different-secret", mediaPlaybackClaimsForTest("user-2", "family-2", "file-1", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"expired":          signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "file-1", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(-time.Minute)), jwt.SigningMethodHS256),
		"empty user":       signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("", "family-1", "file-1", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"empty family":     signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "", "file-1", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"empty file":       signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTest("user-1", "family-1", "", mediaPlaybackTokenType, mediaPlaybackTokenAudience, time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"missing token ID": signedMediaPlaybackTokenForTest(t, server.cfg.JWTSecret, mediaPlaybackClaimsForTestWithoutID("user-1", "family-1", "file-1", time.Now().Add(time.Hour)), jwt.SigningMethodHS256),
		"malformed":        "not-a-jwt",
		"route mismatch":   valid,
	}

	for name, raw := range tests {
		t.Run(name, func(t *testing.T) {
			expectedFileID := "file-1"
			if name == "route mismatch" {
				expectedFileID = "another-file"
			}
			if claims, err := server.parseMediaPlaybackToken(raw, expectedFileID); err == nil || claims != nil {
				t.Fatalf("expected rejection, got claims %#v", claims)
			}
		})
	}
}

func TestMediaPlaybackTokenOpaqueIDsRoundTrip(t *testing.T) {
	server := &Server{cfg: config.Config{
		JWTSecret:             "media-playback-test-secret",
		MediaPlaybackTokenTTL: time.Hour,
	}}
	cases := []struct {
		userID   string
		familyID string
		fileID   string
	}{
		{userID: "пользователь/一", familyID: "family%2Fone", fileID: "file/part"},
		{userID: "user|family", familyID: "family:user", fileID: "file%2Fpart?still-opaque"},
	}
	for _, testCase := range cases {
		raw, _, err := server.mintMediaPlaybackToken(testCase.userID, testCase.familyID, testCase.fileID)
		if err != nil {
			t.Fatalf("mint opaque playback token: %v", err)
		}
		claims, err := server.parseMediaPlaybackToken(raw, testCase.fileID)
		if err != nil {
			t.Fatalf("parse opaque playback token: %v", err)
		}
		if claims.UserID != testCase.userID || claims.FamilyID != testCase.familyID || claims.FileID != testCase.fileID {
			t.Fatalf("opaque claims changed: %#v", claims)
		}
	}
}

func TestMediaPlaybackTokenTTLConfiguration(t *testing.T) {
	t.Run("defaults to twelve hours", func(t *testing.T) {
		t.Setenv("MEDIA_PLAYBACK_TOKEN_TTL", "")
		cfg, err := config.Load()
		if err != nil {
			t.Fatalf("load config: %v", err)
		}
		if cfg.MediaPlaybackTokenTTL != 12*time.Hour {
			t.Fatalf("media playback TTL = %s, want 12h", cfg.MediaPlaybackTokenTTL)
		}
	})

	t.Run("accepts flexible duration syntax", func(t *testing.T) {
		t.Setenv("MEDIA_PLAYBACK_TOKEN_TTL", "2d")
		cfg, err := config.Load()
		if err != nil {
			t.Fatalf("load config: %v", err)
		}
		if cfg.MediaPlaybackTokenTTL != 48*time.Hour {
			t.Fatalf("media playback TTL = %s, want 48h", cfg.MediaPlaybackTokenTTL)
		}
	})

	t.Run("rejects invalid duration", func(t *testing.T) {
		t.Setenv("MEDIA_PLAYBACK_TOKEN_TTL", "not-a-duration")
		if _, err := config.Load(); err == nil {
			t.Fatal("expected invalid media playback TTL to fail config loading")
		}
	})
}

func mediaPlaybackClaimsForTest(userID, familyID, fileID, tokenType, audience string, expiresAt time.Time) mediaPlaybackClaims {
	now := time.Now().Add(-time.Second)
	return mediaPlaybackClaims{
		UserID:   userID,
		FamilyID: familyID,
		FileID:   fileID,
		Type:     tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Audience:  jwt.ClaimStrings{audience},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        "test-token-id",
		},
	}
}

func mediaPlaybackClaimsForTestWithoutID(userID, familyID, fileID string, expiresAt time.Time) mediaPlaybackClaims {
	claims := mediaPlaybackClaimsForTest(userID, familyID, fileID, mediaPlaybackTokenType, mediaPlaybackTokenAudience, expiresAt)
	claims.ID = ""
	return claims
}

func signedMediaPlaybackTokenForTest(t *testing.T, secret string, claims mediaPlaybackClaims, method jwt.SigningMethod) string {
	t.Helper()
	raw, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign test playback token: %v", err)
	}
	return raw
}
