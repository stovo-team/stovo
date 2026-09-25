package app

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"stovo-messenger/backend/internal/config"
	featurefamily "stovo-messenger/backend/internal/features/family"
	featureroles "stovo-messenger/backend/internal/features/roles"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/argon2"
)

const (
	ownerRole  = "owner"
	adminRole  = "admin"
	memberRole = "member"
	childRole  = "child"

	permissionManageServer       = "manage_server"
	permissionManageRoles        = "manage_roles"
	permissionManageMembers      = "manage_members"
	permissionManageChannels     = "manage_channels"
	permissionManageMessages     = "manage_messages"
	permissionManageCalls        = "manage_calls"
	permissionManagePlans        = "manage_plans"
	permissionManageFiles        = "manage_files"
	permissionManageIntegrations = "manage_integrations"
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

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
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
	defer func() { _ = resp.Body.Close() }()
	status := resp.StatusCode
	ok := status >= 200 && status < 500
	if ok {
		return true, &status, "reachable"
	}
	return false, &status, resp.Status
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

func (s *Server) loadServerRole(ctx context.Context, familyID, roleID string) (serverRolePublic, error) {
	role, err := s.roles.Get(ctx, familyID, roleID)
	return serverRoleFromFeature(role), err
}

func serverRoleFromFeature(role featureroles.Role) serverRolePublic {
	return serverRolePublic{ID: role.ID, Name: role.Name, Description: role.Description, Permissions: role.Permissions, IsDefault: role.IsDefault, MemberCount: role.MemberCount}
}

func (s *Server) hydrateUserRole(ctx context.Context, user *userPublic) {
	if user.Role == ownerRole {
		user.Permissions = []string{}
		user.RoleName = "Owner"
		return
	}
	role, err := s.loadServerRole(ctx, user.FamilyID, user.RoleID)
	if err != nil {
		return
	}
	user.RoleName, user.Permissions = role.Name, role.Permissions
}

func hasPermission(user userPublic, permission string) bool {
	if user.Role == ownerRole {
		return true
	}
	for _, value := range user.Permissions {
		if value == permission {
			return true
		}
	}
	return false
}

func (s *Server) assignServerRole(ctx context.Context, familyID, userID, roleID string) error {
	if _, err := s.loadServerRole(ctx, familyID, roleID); err != nil {
		return err
	}
	return s.roles.Assign(ctx, familyID, userID, roleID)
}

func (s *Server) getInviteByID(ctx context.Context, inviteID string) (invitePublic, error) {
	inv, err := s.familyQueries.InviteByID(ctx, inviteID)
	if err != nil {
		return invitePublic{}, err
	}
	return invitePublicFromFamilyInvite(inv), nil
}

func (s *Server) findInviteByToken(ctx context.Context, rawToken string) (invitePublic, familyPublic, error) {
	hashed := tokenHash(s.cfg.InviteTokenSecret, rawToken)
	inv, err := s.familyQueries.InviteByTokenHash(ctx, hashed)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	invite := invitePublicFromFamilyInvite(inv)
	if invite.RevokedAt != nil || invite.UsedCount >= invite.MaxUses || invite.ExpiresAt.Before(time.Now()) {
		return invitePublic{}, familyPublic{}, errNotFound
	}
	family, err := s.getFamily(invite.FamilyID)
	if err != nil {
		return invitePublic{}, familyPublic{}, err
	}
	return invite, family, nil
}

func invitePublicFromFamilyInvite(inv featurefamily.Invite) invitePublic {
	return invitePublic{ID: inv.ID, FamilyID: inv.FamilyID, Role: inv.Role, ExpiresAt: inv.ExpiresAt, MaxUses: inv.MaxUses, UsedCount: inv.UsedCount, CreatedBy: inv.CreatedBy, CreatedAt: inv.CreatedAt, RevokedAt: inv.RevokedAt}
}

func (s *Server) userPublicFromFamilyMember(memberRow featurefamily.Member) userPublic {
	member := userPublic{ID: memberRow.ID, FamilyID: memberRow.FamilyID, Username: memberRow.Username, DisplayName: memberRow.DisplayName, Role: memberRow.Role, IsActive: memberRow.IsActive, PublicKey: memberRow.PublicKey, ProfileVisibility: memberRow.ProfileVisibility, LastSeenVisibility: memberRow.LastSeenVisibility, ReadReceiptsEnabled: memberRow.ReadReceiptsEnabled, DirectMessagePermission: "family", GroupInvitePermission: "allow", ChannelInvitePermission: "allow", VoiceInvitePermission: "allow", Email: memberRow.Email, Bio: memberRow.Bio, Timezone: memberRow.Timezone}
	created := parseTime(memberRow.CreatedAt)
	member.CreatedAt = &created
	if memberRow.LastSeenAt != nil {
		lastSeen := parseTime(*memberRow.LastSeenAt)
		member.LastSeenAt = &lastSeen
	}
	if memberRow.ProfilePhotoFileID != nil {
		if file, err := s.buildFilePublic(*memberRow.ProfilePhotoFileID, member.ID); err == nil && file.DeletedAt == nil {
			member.ProfilePhoto = &file
		}
	}
	if memberRow.AudioCallSettings != nil {
		var settings audioCallSettings
		if json.Unmarshal([]byte(*memberRow.AudioCallSettings), &settings) == nil && settings.Privacy != nil {
			member.DirectMessagePermission = settings.Privacy.DirectMessagePermission
			member.GroupInvitePermission = settings.Privacy.GroupInvitePermission
			member.ChannelInvitePermission = settings.Privacy.ChannelInvitePermission
			member.VoiceInvitePermission = settings.Privacy.VoiceInvitePermission
			member.InvitePermissionUserIDs = settings.Privacy.InvitePermissionUserIDs
		}
	}
	return member
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
