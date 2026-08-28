package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"stovo-messenger/backend/ent"
)

type mcpConnectorContextKey struct{}

var (
	errMCPUnauthorized = errors.New("invalid or missing connector token")
	errMCPForbidden    = errors.New("connector policy denied")
)

func mcpConnectorFromContext(ctx context.Context) (mcpConnectorRecord, bool) {
	value := ctx.Value(mcpConnectorContextKey{})
	if value == nil {
		return mcpConnectorRecord{}, false
	}
	connector, ok := value.(mcpConnectorRecord)
	return connector, ok
}

func mcpConnectorFromEnt(c *ent.McpConnector) mcpConnectorRecord {
	connector := mcpConnectorRecord{
		ID:                 c.ID,
		FamilyID:           c.FamilyID,
		Name:               c.Name,
		ActorUserID:        c.ActorUserID,
		TokenHash:          c.TokenHash,
		Enabled:            c.Enabled,
		CreatedBy:          c.CreatedBy,
		CreatedAt:          parseTime(c.CreatedAt),
		MaxHistoryMessages: clampMCPHistoryLimit(c.MaxHistoryMessages),
		Provider:           normalizeMCPProvider(c.Provider),
		Alias:              c.Alias,
		AuthMode:           normalizeMCPAuthMode(c.AuthMode),
	}
	if c.RevokedAt != nil && strings.TrimSpace(*c.RevokedAt) != "" {
		t := parseTime(*c.RevokedAt)
		connector.RevokedAt = &t
	}
	if c.LastUsedAt != nil && strings.TrimSpace(*c.LastUsedAt) != "" {
		t := parseTime(*c.LastUsedAt)
		connector.LastUsedAt = &t
	}
	perms := defaultMCPPermissions()
	if strings.TrimSpace(c.Permissions) != "" {
		var raw map[string]bool
		if err := json.Unmarshal([]byte(c.Permissions), &raw); err == nil {
			perms = normalizeMCPPermissions(raw)
		}
	}
	connector.Permissions = perms
	return connector
}

func (s *Server) resolveMCPConnectorFromRequest(r *http.Request) (mcpConnectorRecord, error) {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authorization, "Bearer ") {
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	raw := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
	if raw == "" {
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	return s.resolveMCPConnectorByToken(raw)
}

func (s *Server) resolveMCPConnectorByToken(rawToken string) (mcpConnectorRecord, error) {
	hash := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	row, err := s.store.GetMCPConnectorByTokenHash(context.Background(), hash)
	if err != nil {
		if ent.IsNotFound(err) {
			return mcpConnectorRecord{}, errMCPUnauthorized
		}
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	connector := mcpConnectorFromEnt(row)
	if !connector.Enabled || connector.RevokedAt != nil {
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	chats, err := s.loadMCPConnectorChatIDs(connector.ID)
	if err != nil {
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	connector.AllowedChatIDs = chats
	_ = s.touchMCPConnectorLastUsed(connector.ID)
	return connector, nil
}

func (s *Server) loadMCPConnectorChatIDs(connectorID string) ([]string, error) {
	return s.store.ListMCPConnectorChatIDs(context.Background(), connectorID)
}

func (s *Server) touchMCPConnectorLastUsed(connectorID string) error {
	return s.store.TouchMCPConnectorLastUsed(context.Background(), connectorID, nowString())
}

func (s *Server) requireMCPPermission(connector mcpConnectorRecord, permission string) error {
	if !connector.Permissions.Has(permission) {
		return errMCPForbidden
	}
	return nil
}

func (s *Server) requireMCPChatAllowed(connector mcpConnectorRecord, chatID string) error {
	chatID = strings.TrimSpace(chatID)
	if chatID == "" {
		return errMCPForbidden
	}
	for _, allowed := range connector.AllowedChatIDs {
		if allowed == chatID {
			familyID, err := s.store.GetChatFamilyID(context.Background(), chatID)
			if err != nil || familyID != connector.FamilyID {
				return errMCPForbidden
			}
			return nil
		}
	}
	return errMCPForbidden
}

func (s *Server) loadMCPConnectorByID(familyID, connectorID string) (mcpConnectorRecord, error) {
	row, err := s.store.GetMCPConnectorByID(context.Background(), familyID, connectorID)
	if err != nil {
		return mcpConnectorRecord{}, err
	}
	connector := mcpConnectorFromEnt(row)
	chats, err := s.loadMCPConnectorChatIDs(connector.ID)
	if err != nil {
		return mcpConnectorRecord{}, err
	}
	connector.AllowedChatIDs = chats
	return connector, nil
}

func (s *Server) listMCPConnectors(familyID string) ([]mcpConnectorPublic, error) {
	rows, err := s.store.ListMCPConnectors(context.Background(), familyID)
	if err != nil {
		return nil, err
	}
	out := make([]mcpConnectorPublic, 0, len(rows))
	for _, row := range rows {
		connector := mcpConnectorFromEnt(row)
		chats, err := s.loadMCPConnectorChatIDs(connector.ID)
		if err != nil {
			return nil, err
		}
		connector.AllowedChatIDs = chats
		out = append(out, connector.toPublic())
	}
	return out, nil
}
