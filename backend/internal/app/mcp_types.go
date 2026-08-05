package app

import (
	"fmt"
	"strings"
	"time"
)

const (
	connectorRole = "connector"

	mcpProviderClaudeCode = "claude_code"
	mcpProviderCodex      = "codex"
	mcpProviderOpenClaw   = "openclaw"
	mcpProviderHermes     = "hermes"

	mcpAuthModeSubscription = "subscription"
	mcpAuthModeAPI          = "api"

	mcpPermChatsList       = "chats.list"
	mcpPermMessagesRead    = "messages.read"
	mcpPermMessagesSearch  = "messages.search"
	mcpPermMessagesSend    = "messages.send"
	mcpPermMessagesEdit    = "messages.edit"
	mcpPermMessagesDelete  = "messages.delete"
	mcpPermMessagesReact   = "messages.react"
	mcpPermMessagesForward = "messages.forward"
	mcpPermMessagesPin     = "messages.pin"
	mcpPermMessagesUnpin   = "messages.unpin"
	mcpPermFilesList       = "files.list"
	mcpPermFilesDownload   = "files.download"

	mcpDefaultMaxHistory = 50
	mcpMinMaxHistory     = 1
	mcpMaxMaxHistory     = 500
)

var mcpAllPermissionKeys = []string{
	mcpPermChatsList,
	mcpPermMessagesRead,
	mcpPermMessagesSearch,
	mcpPermMessagesSend,
	mcpPermMessagesEdit,
	mcpPermMessagesDelete,
	mcpPermMessagesReact,
	mcpPermMessagesForward,
	mcpPermMessagesPin,
	mcpPermMessagesUnpin,
	mcpPermFilesList,
	mcpPermFilesDownload,
}

type mcpPermissions map[string]bool

func defaultMCPPermissions() mcpPermissions {
	perms := make(mcpPermissions, len(mcpAllPermissionKeys))
	for _, key := range mcpAllPermissionKeys {
		perms[key] = false
	}
	return perms
}

func (p mcpPermissions) Has(key string) bool {
	if p == nil {
		return false
	}
	return p[key]
}

func normalizeMCPPermissions(raw map[string]bool) mcpPermissions {
	perms := defaultMCPPermissions()
	if raw == nil {
		return perms
	}
	for _, key := range mcpAllPermissionKeys {
		if value, ok := raw[key]; ok {
			perms[key] = value
		}
	}
	return perms
}

func clampMCPHistoryLimit(value int) int {
	if value < mcpMinMaxHistory {
		return mcpDefaultMaxHistory
	}
	if value > mcpMaxMaxHistory {
		return mcpMaxMaxHistory
	}
	return value
}

func normalizeMCPProvider(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case mcpProviderCodex, "chatgpt", "openai", "chatgpt_codex":
		return mcpProviderCodex
	case mcpProviderOpenClaw:
		return mcpProviderOpenClaw
	case mcpProviderHermes:
		return mcpProviderHermes
	case mcpProviderClaudeCode, "claude", "anthropic", "":
		return mcpProviderClaudeCode
	default:
		return ""
	}
}

func defaultMCPAliasForProvider(provider string) string {
	switch normalizeMCPProvider(provider) {
	case mcpProviderCodex:
		return "codex"
	case mcpProviderOpenClaw:
		return "openclaw"
	case mcpProviderHermes:
		return "hermes"
	default:
		return "claude"
	}
}

func normalizeMCPAlias(raw, provider string) (string, error) {
	alias := strings.TrimSpace(strings.ToLower(raw))
	alias = strings.TrimPrefix(alias, "@")
	if alias == "" {
		alias = defaultMCPAliasForProvider(provider)
	}
	if len(alias) < 2 || len(alias) > 32 {
		return "", fmt.Errorf("alias must be 2-32 characters")
	}
	for _, r := range alias {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return "", fmt.Errorf("alias may only contain letters, numbers, _ and -")
	}
	return alias, nil
}

func normalizeMCPAuthMode(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case mcpAuthModeAPI, "api_key", "apikey", "key":
		return mcpAuthModeAPI
	case mcpAuthModeSubscription, "sub", "subscription_based", "":
		return mcpAuthModeSubscription
	default:
		return ""
	}
}

type mcpConnectorRecord struct {
	ID                 string
	FamilyID           string
	Name               string
	ActorUserID        string
	TokenHash          string
	Enabled            bool
	RevokedAt          *time.Time
	CreatedBy          string
	CreatedAt          time.Time
	LastUsedAt         *time.Time
	MaxHistoryMessages int
	Permissions        mcpPermissions
	Provider           string
	Alias              string
	AuthMode           string
	AllowedChatIDs     []string
}

type mcpConnectorPublic struct {
	ID                 string         `json:"id"`
	Name               string         `json:"name"`
	ActorUserID        string         `json:"actorUserId"`
	Enabled            bool           `json:"enabled"`
	Revoked            bool           `json:"revoked"`
	CreatedBy          string         `json:"createdBy"`
	CreatedAt          time.Time      `json:"createdAt"`
	LastUsedAt         *time.Time     `json:"lastUsedAt"`
	MaxHistoryMessages int            `json:"maxHistoryMessages"`
	Permissions        mcpPermissions `json:"permissions"`
	Provider           string         `json:"provider"`
	Alias              string         `json:"alias"`
	AuthMode           string         `json:"authMode"`
	AllowedChatIDs     []string       `json:"allowedChatIds"`
}

type mcpConnectorCreateRequest struct {
	Name               string          `json:"name"`
	Provider           string          `json:"provider"`
	Alias              string          `json:"alias"`
	AuthMode           string          `json:"authMode"`
	AllowedChatIDs     []string        `json:"allowedChatIds"`
	Permissions        map[string]bool `json:"permissions"`
	MaxHistoryMessages *int            `json:"maxHistoryMessages"`
}

type mcpConnectorUpdateRequest struct {
	Name               *string         `json:"name"`
	Alias              *string         `json:"alias"`
	AuthMode           *string         `json:"authMode"`
	AllowedChatIDs     *[]string       `json:"allowedChatIds"`
	Permissions        map[string]bool `json:"permissions"`
	MaxHistoryMessages *int            `json:"maxHistoryMessages"`
	Enabled            *bool           `json:"enabled"`
}

type mcpConnectorCreateResponse struct {
	Connector     mcpConnectorPublic `json:"connector"`
	Token         string             `json:"token"`
	MCPURL        string             `json:"mcpUrl"`
	ClaudeCommand string             `json:"claudeCommand"`
	SetupPrompt   string             `json:"setupPrompt"`
	CLICommand    string             `json:"cliCommand"`
}

type mcpConnectorTokenResponse struct {
	Connector     mcpConnectorPublic `json:"connector"`
	Token         string             `json:"token"`
	MCPURL        string             `json:"mcpUrl"`
	ClaudeCommand string             `json:"claudeCommand"`
	SetupPrompt   string             `json:"setupPrompt"`
	CLICommand    string             `json:"cliCommand"`
}

type mcpAuditEventPublic struct {
	ID          string    `json:"id"`
	ConnectorID string    `json:"connectorId"`
	ActorUserID string    `json:"actorUserId"`
	Action      string    `json:"action"`
	ChatID      *string   `json:"chatId"`
	MessageID   *string   `json:"messageId"`
	Success     bool      `json:"success"`
	Error       *string   `json:"error"`
	Meta        any       `json:"meta,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (c mcpConnectorRecord) toPublic() mcpConnectorPublic {
	allowed := c.AllowedChatIDs
	if allowed == nil {
		allowed = []string{}
	}
	perms := c.Permissions
	if perms == nil {
		perms = defaultMCPPermissions()
	}
	provider := c.Provider
	if provider == "" {
		provider = mcpProviderClaudeCode
	}
	alias := c.Alias
	if alias == "" {
		alias = defaultMCPAliasForProvider(provider)
	}
	authMode := c.AuthMode
	if authMode == "" {
		authMode = mcpAuthModeSubscription
	}
	return mcpConnectorPublic{
		ID:                 c.ID,
		Name:               c.Name,
		ActorUserID:        c.ActorUserID,
		Enabled:            c.Enabled,
		Revoked:            c.RevokedAt != nil,
		CreatedBy:          c.CreatedBy,
		CreatedAt:          c.CreatedAt,
		LastUsedAt:         c.LastUsedAt,
		MaxHistoryMessages: c.MaxHistoryMessages,
		Permissions:        perms,
		Provider:           provider,
		Alias:              alias,
		AuthMode:           authMode,
		AllowedChatIDs:     allowed,
	}
}
