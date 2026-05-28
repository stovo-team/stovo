package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"family-messenger/backend/internal/config"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/argon2"
)

const (
	ownerRole  = "owner"
	adminRole  = "admin"
	memberRole = "member"
	childRole  = "child"
)

var (
	errUnauthorized = errors.New("unauthorized")
	errForbidden    = errors.New("forbidden")
	errNotFound     = errors.New("not found")
	errBadRequest   = errors.New("bad request")
)

type statusError struct {
	Status  int
	Message string
}

func (e statusError) Error() string {
	return e.Message
}

func newStatusError(status int, message string) error {
	return statusError{Status: status, Message: message}
}

type accessClaims struct {
	UserID   string `json:"uid"`
	FamilyID string `json:"fid"`
	Role     string `json:"role"`
	Type     string `json:"typ"`
	jwt.RegisteredClaims
}

func createAccessToken(cfg config.Config, user userPublic) (string, int64, error) {
	expiresAt := time.Now().Add(cfg.AccessTokenTTL)
	claims := accessClaims{
		UserID:   user.ID,
		FamilyID: user.FamilyID,
		Role:     user.Role,
		Type:     "access",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		return "", 0, err
	}
	return signed, int64(cfg.AccessTokenTTL.Seconds()), nil
}

func parseAccessToken(cfg config.Config, raw string) (*accessClaims, error) {
	claims := &accessClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		return []byte(cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid || claims.Type != "access" {
		return nil, errors.New("invalid access token")
	}
	return claims, nil
}

func randomToken() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func tokenHash(secret, raw string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(raw))
	return hex.EncodeToString(mac.Sum(nil))
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return fmt.Sprintf(
		"argon2id$%s$%s",
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "argon2id" {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func isValidRole(role string) bool {
	switch role {
	case ownerRole, adminRole, memberRole, childRole:
		return true
	default:
		return false
	}
}

func isAdmin(role string) bool {
	return role == ownerRole || role == adminRole
}

func trimStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func normalizePublicURL(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, errors.New("URL must start with http:// or https://")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("URL must start with http:// or https://")
	}
	if parsed.Host == "" {
		return nil, errors.New("URL must include a host")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("URL must not include query parameters or fragments")
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	normalized := strings.TrimRight(parsed.String(), "/")
	return &normalized, nil
}

func sanitizeFilename(name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	base = strings.TrimSpace(base)
	if base == "" || base == "." {
		return "file"
	}
	replacer := strings.NewReplacer("..", "", "/", "-", "\\", "-", "\x00", "")
	return replacer.Replace(base)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func readUpload(file multipart.File, limit int64) ([]byte, error) {
	defer file.Close()
	reader := io.LimitReader(file, limit+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errors.New("file exceeds size limit")
	}
	return data, nil
}

func chooseMessageType(content *string, files []filePublic) string {
	if len(files) == 0 {
		return "text"
	}
	kindSet := map[string]struct{}{}
	for _, file := range files {
		switch {
		case strings.HasPrefix(file.MimeType, "image/"):
			kindSet["image"] = struct{}{}
		case strings.HasPrefix(file.MimeType, "video/"):
			kindSet["video"] = struct{}{}
		default:
			kindSet["file"] = struct{}{}
		}
	}
	if content != nil && strings.TrimSpace(*content) != "" {
		return "mixed"
	}
	if len(kindSet) > 1 {
		return "mixed"
	}
	for kind := range kindSet {
		return kind
	}
	return "file"
}

func allowedMime(mime string) bool {
	switch mime {
	case "image/jpeg", "image/png", "image/gif", "image/webp",
		"video/mp4", "video/webm", "video/quicktime",
		"audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm",
		"application/pdf", "text/plain",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return true
	default:
		return false
	}
}

func boolFromNull(value sql.NullBool) bool {
	return value.Valid && value.Bool
}

func stringPtrFromNull(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func timePtrFromNull(value sql.NullTime) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

func intPtr(value int) *int {
	return &value
}

func intStatusPtr(value int) *int {
	return &value
}

func probeTCP(host string, port int, timeout time.Duration) error {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, fmt.Sprintf("%d", port)), timeout)
	if err != nil {
		return err
	}
	_ = conn.Close()
	return nil
}

func checkURL(target string, timeout time.Duration) (bool, *int, string) {
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
	if err != nil {
		return false, nil, err.Error()
	}
	req.Header.Set("Accept", "application/json,text/html,*/*")
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return false, nil, err.Error()
	}
	defer resp.Body.Close()
	status := resp.StatusCode
	ok := status >= 200 && status < 500
	if ok {
		return true, &status, "reachable"
	}
	return false, &status, resp.Status
}
