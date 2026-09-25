package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	featuremcp "stovo-messenger/backend/internal/features/mcp"
	featuremessages "stovo-messenger/backend/internal/features/messages"
	httptransport "stovo-messenger/backend/internal/transport/http"
	mcptransport "stovo-messenger/backend/internal/transport/mcp"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
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

func mcpConnectorFromFeature(c featuremcp.Connector) mcpConnectorRecord {
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
	connector.Permissions = normalizeMCPPermissions(c.Permissions)
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
	row, chats, err := s.mcpConnectors.AuthorizeTokenHash(context.Background(), hash)
	if err != nil {
		return mcpConnectorRecord{}, errMCPUnauthorized
	}
	connector := mcpConnectorFromFeature(row)
	connector.AllowedChatIDs = chats
	_ = s.touchMCPConnectorLastUsed(connector.ID)
	return connector, nil
}

func (s *Server) loadMCPConnectorChatIDs(connectorID string) ([]string, error) {
	return s.mcpConnectors.ChatIDs(context.Background(), connectorID)
}

func (s *Server) touchMCPConnectorLastUsed(connectorID string) error {
	return s.mcpConnectors.TouchLastUsed(context.Background(), connectorID, nowString())
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
			familyID, err := s.mcpConnectors.ChatFamilyID(context.Background(), chatID)
			if err != nil || familyID != connector.FamilyID {
				return errMCPForbidden
			}
			return nil
		}
	}
	return errMCPForbidden
}

func (s *Server) loadMCPConnectorByID(familyID, connectorID string) (mcpConnectorRecord, error) {
	row, err := s.mcpConnectors.ByID(context.Background(), familyID, connectorID)
	if err != nil {
		return mcpConnectorRecord{}, err
	}
	connector := mcpConnectorFromFeature(row)
	chats, err := s.loadMCPConnectorChatIDs(connector.ID)
	if err != nil {
		return mcpConnectorRecord{}, err
	}
	connector.AllowedChatIDs = chats
	return connector, nil
}

func (s *Server) listMCPConnectors(familyID string) ([]mcpConnectorPublic, error) {
	rows, err := s.mcpConnectors.List(context.Background(), familyID)
	if err != nil {
		return nil, err
	}
	out := make([]mcpConnectorPublic, 0, len(rows))
	for _, row := range rows {
		connector := mcpConnectorFromFeature(row)
		chats, err := s.loadMCPConnectorChatIDs(connector.ID)
		if err != nil {
			return nil, err
		}
		connector.AllowedChatIDs = chats
		out = append(out, connector.toPublic())
	}
	return out, nil
}

func (s *Server) initMCP() {
	s.mcpHTTP = mcptransport.New(mcptransport.Config{
		Name: "stovo", Version: s.cfg.AppVersion, Endpoint: "/mcp",
		Register: s.registerMCPTools,
		BridgeContext: func(ctx context.Context) context.Context {
			if connector, ok := mcpConnectorFromContext(ctx); ok {
				return context.WithValue(ctx, mcpConnectorContextKey{}, connector)
			}
			return ctx
		},
	})
}

func (s *Server) mcpAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		connector, err := s.resolveMCPConnectorFromRequest(r)
		if err != nil {
			s.detail(w, http.StatusUnauthorized, "Invalid or missing connector token")
			return
		}
		ctx := context.WithValue(r.Context(), mcpConnectorContextKey{}, connector)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) mcpToolJSON(v any) (*mcp.CallToolResult, error) {
	result, err := mcp.NewToolResultJSON(v)
	if err != nil {
		return mcp.NewToolResultError("failed to encode tool result"), nil
	}
	return result, nil
}

func (s *Server) mcpToolError(message string) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(message), nil
}

func (s *Server) mcpActor(connector mcpConnectorRecord) (userPublic, error) {
	user, err := s.getUserByID(connector.ActorUserID)
	if err != nil {
		return userPublic{}, err
	}
	user.IsActive = true
	return user, nil
}

func (s *Server) mcpAdminHandler(user userPublic) httptransport.MCPConnectorAdminHandler {
	return httptransport.NewMCPConnectorAdminHandler(httptransport.MCPConnectorAdminOperations{
		IsAdmin: func(actor httptransport.AdminActor) bool { return hasPermission(user, permissionManageIntegrations) },
		Create: func(ctx context.Context, actor httptransport.AdminActor, payload httptransport.MCPConnectorCreatePayload, r *http.Request) (any, error) {
			name := strings.TrimSpace(payload.Name)
			if name == "" {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "name is required"}
			}
			if len(name) > 120 {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "name is too long"}
			}
			provider := normalizeMCPProvider(payload.Provider)
			if provider == "" {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "provider must be claude_code, codex, openclaw, or hermes"}
			}
			alias, err := normalizeMCPAlias(payload.Alias, provider)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: err.Error()}
			}
			authMode := normalizeMCPAuthMode(payload.AuthMode)
			if authMode == "" {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "authMode must be subscription or api"}
			}
			if taken, takeErr := s.mcpConnectors.AliasTaken(ctx, actor.FamilyID, alias, ""); takeErr != nil {
				s.logger.Errorf("mcp", "alias validation failed family=%s alias=%s error=%v", actor.FamilyID, alias, takeErr)
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not validate alias"}
			} else if taken {
				return nil, httptransport.AdminHTTPError{Status: http.StatusConflict, Detail: "alias is already used by another connector"}
			}
			historyLimit := mcpDefaultMaxHistory
			if payload.MaxHistoryMessages != nil {
				historyLimit = clampMCPHistoryLimit(*payload.MaxHistoryMessages)
			}
			permissions := normalizeMCPPermissions(payload.Permissions)
			chatIDs, err := s.validateMCPAllowedChats(actor.FamilyID, payload.AllowedChatIDs)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: err.Error()}
			}
			if len(chatIDs) == 0 {
				return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "select at least one chat for this connector's Space scope"}
			}

			rawToken, err := randomToken()
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not generate connector token"}
			}
			tokenHashValue := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
			connectorID := uuid.NewString()
			actorUserID := uuid.NewString()
			now := nowString()

			passwordHash, err := hashPassword(uuid.NewString() + uuid.NewString())
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not create MCP connector"}
			}
			username := fmt.Sprintf("mcp_%s", strings.ReplaceAll(connectorID, "-", ""))
			if len(username) > 60 {
				username = username[:60]
			}
			if err := s.mcpConnectors.Create(ctx, featuremcp.ConnectorCreate{
				ID: connectorID, FamilyID: actor.FamilyID, Name: name, ActorUserID: actorUserID,
				ActorUsername: username, ActorPasswordHash: passwordHash, TokenHash: tokenHashValue,
				CreatedBy: actor.ID, CreatedAt: now, MaxHistoryMessages: historyLimit, Permissions: permissions,
				Provider: provider, Alias: alias, AuthMode: authMode, ChatIDs: chatIDs,
			}); err != nil {
				s.logger.Errorf("mcp", "create connector failed family=%s error=%v", actor.FamilyID, err)
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not create MCP connector"}
			}

			connector, err := s.loadMCPConnectorByID(actor.FamilyID, connectorID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load created connector"}
			}
			mcpURL, command, setupPrompt := s.mcpConnectArtifactsForURL(s.mcpBaseURLForRequest(r), provider, authMode, alias, name, rawToken)
			s.recordMCPAudit(ctx, connector, "connector.create", nil, nil, true, nil, map[string]any{
				"name":     name,
				"provider": provider,
				"alias":    alias,
				"authMode": authMode,
			})
			return mcpConnectorCreateResponse{
				Connector:     connector.toPublic(),
				Token:         rawToken,
				MCPURL:        mcpURL,
				ClaudeCommand: command,
				SetupPrompt:   setupPrompt,
				CLICommand:    command,
			}, nil
		},
		Update: func(ctx context.Context, actor httptransport.AdminActor, connectorID string, payload httptransport.MCPConnectorUpdatePayload) (any, error) {
			connector, err := s.loadMCPConnectorByID(actor.FamilyID, connectorID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusNotFound, Detail: "Connector not found"}
			}
			if connector.RevokedAt != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusConflict, Detail: "Connector is revoked"}
			}

			name := connector.Name
			if payload.Name != nil {
				name = strings.TrimSpace(*payload.Name)
				if name == "" {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "name is required"}
				}
				if len(name) > 120 {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "name is too long"}
				}
			}
			alias := connector.Alias
			if payload.Alias != nil {
				normalizedAlias, aliasErr := normalizeMCPAlias(*payload.Alias, connector.Provider)
				if aliasErr != nil {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: aliasErr.Error()}
				}
				alias = normalizedAlias
				if taken, takeErr := s.mcpConnectors.AliasTaken(ctx, actor.FamilyID, alias, connector.ID); takeErr != nil {
					s.logger.Errorf("mcp", "alias validation failed family=%s alias=%s connector=%s error=%v", actor.FamilyID, alias, connector.ID, takeErr)
					return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not validate alias"}
				} else if taken {
					return nil, httptransport.AdminHTTPError{Status: http.StatusConflict, Detail: "alias is already used by another connector"}
				}
			}
			authMode := connector.AuthMode
			if authMode == "" {
				authMode = mcpAuthModeSubscription
			}
			if payload.AuthMode != nil {
				normalizedMode := normalizeMCPAuthMode(*payload.AuthMode)
				if normalizedMode == "" {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: "authMode must be subscription or api"}
				}
				authMode = normalizedMode
			}
			historyLimit := connector.MaxHistoryMessages
			if payload.MaxHistoryMessages != nil {
				historyLimit = clampMCPHistoryLimit(*payload.MaxHistoryMessages)
			}
			permissions := connector.Permissions
			if payload.Permissions != nil {
				permissions = normalizeMCPPermissions(payload.Permissions)
			}
			enabled := connector.Enabled
			if payload.Enabled != nil {
				enabled = *payload.Enabled
			}
			chatIDs := connector.AllowedChatIDs
			if payload.AllowedChatIDs != nil {
				validated, validateErr := s.validateMCPAllowedChats(actor.FamilyID, *payload.AllowedChatIDs)
				if validateErr != nil {
					return nil, httptransport.AdminHTTPError{Status: http.StatusUnprocessableEntity, Detail: validateErr.Error()}
				}
				chatIDs = validated
			}

			if err := s.mcpConnectors.Update(ctx, featuremcp.ConnectorUpdate{
				ConnectorID: connector.ID, FamilyID: actor.FamilyID, ActorUserID: connector.ActorUserID,
				Name: name, Enabled: enabled, MaxHistoryMessages: historyLimit, Permissions: permissions,
				Alias: alias, AuthMode: authMode, ChatIDs: chatIDs, UpdatedAt: nowString(),
			}); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not update MCP connector"}
			}

			updated, err := s.loadMCPConnectorByID(actor.FamilyID, connector.ID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load updated connector"}
			}
			s.recordMCPAudit(ctx, updated, "connector.update", nil, nil, true, nil, map[string]any{"enabled": enabled})
			return updated.toPublic(), nil
		},
		RegenerateToken: func(ctx context.Context, actor httptransport.AdminActor, connectorID string, r *http.Request) (any, error) {
			connector, err := s.loadMCPConnectorByID(actor.FamilyID, connectorID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusNotFound, Detail: "Connector not found"}
			}
			if connector.RevokedAt != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusConflict, Detail: "Connector is revoked"}
			}
			rawToken, err := randomToken()
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not generate connector token"}
			}
			tokenHashValue := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
			if err := s.mcpConnectors.RegenerateToken(ctx, connector.ID, actor.FamilyID, tokenHashValue); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not regenerate token"}
			}
			updated, err := s.loadMCPConnectorByID(actor.FamilyID, connector.ID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load connector"}
			}
			mcpURL, command, setupPrompt := s.mcpConnectArtifactsForURL(s.mcpBaseURLForRequest(r), updated.Provider, updated.AuthMode, updated.Alias, updated.Name, rawToken)
			s.recordMCPAudit(ctx, updated, "connector.regenerate_token", nil, nil, true, nil, nil)
			return mcpConnectorTokenResponse{
				Connector:     updated.toPublic(),
				Token:         rawToken,
				MCPURL:        mcpURL,
				ClaudeCommand: command,
				SetupPrompt:   setupPrompt,
				CLICommand:    command,
			}, nil
		},
		Revoke: func(ctx context.Context, actor httptransport.AdminActor, connectorID string) (any, error) {
			connector, err := s.loadMCPConnectorByID(actor.FamilyID, connectorID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusNotFound, Detail: "Connector not found"}
			}
			if connector.RevokedAt != nil {
				return connector.toPublic(), nil
			}
			now := nowString()
			if err := s.mcpConnectors.Revoke(ctx, featuremcp.ConnectorRevoke{
				ConnectorID: connector.ID, FamilyID: actor.FamilyID, RevokedAt: now,
				TokenHash: "revoked:" + uuid.NewString(), DisplayName: connector.Name + " (revoked)", ActorUserID: connector.ActorUserID,
			}); err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not revoke connector"}
			}
			updated, _ := s.loadMCPConnectorByID(actor.FamilyID, connector.ID)
			s.recordMCPAudit(ctx, connector, "connector.revoke", nil, nil, true, nil, nil)
			return updated.toPublic(), nil
		},
		ListAudit: func(ctx context.Context, actor httptransport.AdminActor, connectorID string) (any, error) {
			connector, err := s.loadMCPConnectorByID(actor.FamilyID, connectorID)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusNotFound, Detail: "Connector not found"}
			}
			events, err := s.listMCPAuditEvents(actor.FamilyID, connector.ID, 100)
			if err != nil {
				return nil, httptransport.AdminHTTPError{Status: http.StatusInternalServerError, Detail: "Could not load audit events"}
			}
			return events, nil
		},
	})
}

func (s *Server) validateMCPAllowedChats(familyID string, chatIDs []string) ([]string, error) {
	if chatIDs == nil {
		return []string{}, nil
	}
	seen := make(map[string]struct{}, len(chatIDs))
	out := make([]string, 0, len(chatIDs))
	for _, raw := range chatIDs {
		chatID := strings.TrimSpace(raw)
		if chatID == "" {
			continue
		}
		if _, ok := seen[chatID]; ok {
			continue
		}
		chatFamilyID, err := s.mcpConnectors.ChatFamilyID(context.Background(), chatID)
		if err != nil {
			return nil, fmt.Errorf("chat not found: %s", chatID)
		}
		if chatFamilyID != familyID {
			return nil, fmt.Errorf("chat not found: %s", chatID)
		}
		seen[chatID] = struct{}{}
		out = append(out, chatID)
	}
	return out, nil
}

func (s *Server) mcpBaseURL(familyID string) string {
	family, err := s.getFamily(familyID)
	base := strings.TrimRight(s.cfg.AppURL, "/")
	if err == nil {
		settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
		if settings.AppURL != "" {
			base = settings.AppURL
		}
	}
	return mcpURLForServer(base, s.cfg.ServerID)
}

func (s *Server) mcpBaseURLForRequest(r *http.Request) string {
	host := strings.TrimSpace(r.Host)
	if host == "" {
		return s.mcpBaseURL("")
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
		scheme = "https"
	}
	return mcpURLForServer(scheme+"://"+host, s.cfg.ServerID)
}

func mcpURLForServer(baseURL, serverID string) string {
	return mcptransport.URLForServer(baseURL, serverID)
}

func (s *Server) mcpConnectArtifactsForURL(mcpURL, provider, authMode, alias, connectorName, rawToken string) (string, string, string) {
	artifacts := mcptransport.BuildConnectArtifacts(mcpURL, provider, authMode, alias, connectorName, rawToken)
	return artifacts.URL, artifacts.CLICommand, artifacts.SetupPrompt
}

func (s *Server) registerMCPTools(mcpSrv *mcpserver.MCPServer) {
	mcptransport.RegisterTools(mcpSrv, mcptransport.ToolHandlers{ConnectionStatus: s.mcpConnectionStatus, ListChats: s.mcpListChats, GetChatHistory: s.mcpGetChatHistory, SearchMessages: s.mcpSearchMessages, SendMessage: s.mcpSendMessage, EditMessage: s.mcpEditMessage, DeleteMessage: s.mcpDeleteMessage, AddReaction: s.mcpAddReaction, RemoveReaction: s.mcpRemoveReaction, ForwardMessage: s.mcpForwardMessage, PinMessage: s.mcpPinMessage, UnpinMessage: s.mcpUnpinMessage, ListChatFiles: s.mcpListChatFiles, GetDownloadLink: s.mcpGetFileDownloadLink})
}

func (s *Server) mcpRequire(ctx context.Context, permission string, chatID *string) (mcpConnectorRecord, userPublic, *mcp.CallToolResult) {
	connector, ok := mcpConnectorFromContext(ctx)
	if !ok {
		result, _ := s.mcpToolError("connector authentication required")
		return mcpConnectorRecord{}, userPublic{}, result
	}
	if permission != "" {
		if err := s.requireMCPPermission(connector, permission); err != nil {
			msg := fmt.Sprintf("permission denied: %s", permission)
			s.recordMCPAudit(ctx, connector, permission, chatID, nil, false, &msg, nil)
			result, _ := s.mcpToolError(msg)
			return mcpConnectorRecord{}, userPublic{}, result
		}
	}
	if chatID != nil {
		if err := s.requireMCPChatAllowed(connector, *chatID); err != nil {
			msg := "chat is not allowed for this connector"
			s.recordMCPAudit(ctx, connector, permission, chatID, nil, false, &msg, nil)
			result, _ := s.mcpToolError(msg)
			return mcpConnectorRecord{}, userPublic{}, result
		}
	}
	actor, err := s.mcpActor(connector)
	if err != nil {
		result, _ := s.mcpToolError("connector actor unavailable")
		return mcpConnectorRecord{}, userPublic{}, result
	}
	return connector, actor, nil
}

func (s *Server) mcpListChats(ctx context.Context) ([]mcptransport.ChatSummary, error) {
	connector, _, deny := s.mcpRequire(ctx, "", nil)
	if deny != nil {
		return nil, mcpResultError(deny)
	}
	if !connector.Permissions.Has(mcpPermChatsList) {
		msg := "Chat listing is disabled for this connector. In Stovo, open MCP connectors → Configure and enable ‘List chats’."
		s.recordMCPAudit(ctx, connector, mcpPermChatsList, nil, nil, false, &msg, nil)
		return nil, fmt.Errorf("%s", msg)
	}
	if len(connector.AllowedChatIDs) == 0 {
		msg := "This connector has no chat scope in the active Stovo Space. In Stovo, open MCP connectors → Configure and select one or more chats."
		s.recordMCPAudit(ctx, connector, mcpPermChatsList, nil, nil, false, &msg, nil)
		return nil, fmt.Errorf("%s", msg)
	}
	chats := make([]mcptransport.ChatSummary, 0, len(connector.AllowedChatIDs))
	for _, chatID := range connector.AllowedChatIDs {
		if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
			continue
		}
		chatType, err := s.chatQueries.Type(ctx, chatID)
		if err != nil {
			continue
		}
		// Connector identities are deliberately not chat members. The scope is
		// the authorization boundary, so never use member-only chat reads here.
		chats = append(chats, mcptransport.ChatSummary{ID: chatID, Type: chatType, Title: "Allowed chat"})
	}
	if len(chats) == 0 {
		msg := "The configured chats are no longer available in this Stovo Space. Update the connector scope in Stovo."
		s.recordMCPAudit(ctx, connector, mcpPermChatsList, nil, nil, false, &msg, nil)
		return nil, fmt.Errorf("%s", msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermChatsList, nil, nil, true, nil, map[string]any{"count": len(chats)})
	return chats, nil
}

func (s *Server) mcpConnectionStatus(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	connector, _, deny := s.mcpRequire(ctx, "", nil)
	if deny != nil {
		return deny, nil
	}
	state := "ready"
	action := "The connector is ready. Use stovo_list_chats to select a chat before reading or changing messages."
	if len(connector.AllowedChatIDs) == 0 {
		state = "needs_chat_scope"
		action = "No chats are assigned. In Stovo, open MCP connectors → Configure and choose chats in this Space."
	} else if !connector.Permissions.Has(mcpPermChatsList) {
		state = "chat_listing_disabled"
		action = "Chat listing is disabled. In Stovo, open MCP connectors → Configure and enable ‘List chats’."
	}
	spaceName := "Stovo Space"
	if family, err := s.getFamily(connector.FamilyID); err == nil && strings.TrimSpace(family.Name) != "" {
		spaceName = family.Name
	}
	s.recordMCPAudit(ctx, connector, "connector.status", nil, nil, true, nil, map[string]any{"state": state})
	return s.mcpToolJSON(map[string]any{
		"state": state,
		"space": map[string]any{"id": s.cfg.ServerID, "name": spaceName},
		"connector": map[string]any{
			"id": connector.ID, "name": connector.Name, "allowedChatCount": len(connector.AllowedChatIDs),
			"chatListingEnabled": connector.Permissions.Has(mcpPermChatsList),
		},
		"nextAction": action,
	})
}

func mcpResultError(result *mcp.CallToolResult) error {
	for _, content := range result.Content {
		if text, ok := content.(mcp.TextContent); ok {
			return fmt.Errorf("%s", text.Text)
		}
	}
	return fmt.Errorf("tool request denied")
}

func (s *Server) mcpGetChatHistory(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesRead, &chatID)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 {
		limit = connector.MaxHistoryMessages
	}
	if limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}
	before := strings.TrimSpace(request.GetString("before_message_id", ""))
	messages, hasMore, err := s.listMessagesPage(chatID, actor, before, limit, "", "")
	if err != nil {
		msg := err.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesRead, &chatID, nil, false, &msg, nil)
		return s.mcpToolError("could not load messages")
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesRead, &chatID, nil, true, nil, map[string]any{"count": len(messages)})
	return s.mcpToolJSON(map[string]any{
		"chatId":   chatID,
		"messages": messages,
		"hasMore":  hasMore,
	})
}

func (s *Server) mcpSearchMessages(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, err := request.RequireString("query")
	if err != nil || strings.TrimSpace(query) == "" {
		return s.mcpToolError("query is required")
	}
	query = strings.TrimSpace(query)
	if len(query) > 200 {
		return s.mcpToolError("query is too long")
	}
	var chatFilter *string
	chatID := strings.TrimSpace(request.GetString("chat_id", ""))
	if chatID != "" {
		chatFilter = &chatID
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesSearch, chatFilter)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 || limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}

	allowed := connector.AllowedChatIDs
	if chatFilter != nil {
		allowed = []string{*chatFilter}
	}
	if len(allowed) == 0 {
		return s.mcpToolJSON(map[string]any{"matches": []any{}})
	}

	hits, err := s.messageSearch.Plaintext(ctx, allowed, query, limit)
	if err != nil {
		return s.mcpToolError("search failed")
	}
	matches := make([]messagePublic, 0, len(hits))
	for _, hit := range hits {
		message, buildErr := s.buildMessage(hit.ID, actor.ID)
		if buildErr == nil {
			matches = append(matches, message)
		}
	}
	if len(matches) < limit {
		candidates, encErr := s.messageSearch.EncryptedCandidates(ctx, allowed, encryptionProtocolServerAtRest, connector.MaxHistoryMessages*3)
		if encErr == nil {
			seen := map[string]struct{}{}
			for _, existing := range matches {
				seen[existing.ID] = struct{}{}
			}
			needle := strings.ToLower(query)
			for _, cand := range candidates {
				if len(matches) >= limit {
					break
				}
				if _, ok := seen[cand.ID]; ok {
					continue
				}
				plain, decErr := s.decryptServerAtRest(cand.FamilyID, cand.Ciphertext, cand.Nonce)
				if decErr != nil || plain == nil {
					continue
				}
				if !strings.Contains(strings.ToLower(*plain), needle) {
					continue
				}
				message, buildErr := s.buildMessage(cand.ID, actor.ID)
				if buildErr == nil {
					matches = append(matches, message)
					seen[cand.ID] = struct{}{}
				}
			}
		}
	}

	s.recordMCPAudit(ctx, connector, mcpPermMessagesSearch, chatFilter, nil, true, nil, map[string]any{"count": len(matches)})
	return s.mcpToolJSON(map[string]any{"matches": matches})
}

func (s *Server) mcpSendMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	content, err := request.RequireString("content")
	if err != nil {
		return s.mcpToolError("content is required")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return s.mcpToolError("content is required")
	}
	if len(content) > 4000 {
		return s.mcpToolError("content exceeds maximum length of 4000 characters")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesSend, &chatID)
	if deny != nil {
		return deny, nil
	}
	payload := sendMessageRequest{
		Type:    "text",
		Content: &content,
	}
	if replyTo := strings.TrimSpace(request.GetString("reply_to_message_id", "")); replyTo != "" {
		payload.ReplyToMessageID = &replyTo
	}
	message, sendErr := s.createMessageWithPayloadContext(ctx, actor, chatID, payload, nil, nil)
	if sendErr != nil {
		msg := sendErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesSend, &chatID, nil, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesSend, &chatID, &message.ID, true, nil, nil)
	return s.mcpToolJSON(message)
}

func (s *Server) mcpEditMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	content, err := request.RequireString("content")
	if err != nil {
		return s.mcpToolError("content is required")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return s.mcpToolError("content is required")
	}
	if len(content) > 4000 {
		return s.mcpToolError("content exceeds maximum length of 4000 characters")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesEdit, nil)
	if deny != nil {
		return deny, nil
	}

	meta, err := s.messageReads.Target(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	chatID := meta.ChatID
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if meta.SenderID != actor.ID {
		msg := "you can only edit messages sent by this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	chat, err := s.buildChatPublic(chatID, actor)
	if err != nil {
		return s.mcpToolError("chat not found")
	}
	now := nowString()
	if chat.EncryptionProtocol == encryptionProtocolServerAtRest {
		ciphertext, nonce, encErr := s.encryptServerAtRest(chat.FamilyID, content)
		if encErr != nil {
			return s.mcpToolError("encryption failed")
		}
		if err := s.messageMutations.EditEncrypted(ctx, featuremessages.EncryptedEdit{MessageID: messageID, Ciphertext: ciphertext, Nonce: nonce, KeyVersion: 1, EncryptionMetadata: messageEncryptionMetadataServer, UpdatedAt: now}); err != nil {
			return s.mcpToolError("failed to update message")
		}
	} else if err := s.messageMutations.EditPlain(ctx, featuremessages.PlainEdit{MessageID: messageID, Content: content, UpdatedAt: now}); err != nil {
		return s.mcpToolError("failed to update message")
	}
	message, err := s.buildMessage(messageID, actor.ID)
	if err != nil {
		return s.mcpToolError("failed to load updated message")
	}
	s.emitMessageUpdated(chatID, message)
	s.bumpChatHistoryRevision(ctx, chatID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesEdit, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(message)
}

func (s *Server) mcpDeleteMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesDelete, nil)
	if deny != nil {
		return deny, nil
	}
	meta, err := s.messageReads.Target(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	chatID := meta.ChatID
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if meta.SenderID != actor.ID {
		msg := "you can only delete messages sent by this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if err := s.messageMutations.Delete(ctx, featuremessages.Deletion{MessageID: messageID, DeletedAt: nowString()}); err != nil {
		return s.mcpToolError("failed to delete message")
	}
	s.emitMessageDeleted(chatID, messageID)
	s.bumpChatHistoryRevision(ctx, chatID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesDelete, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(map[string]string{"messageId": messageID, "chatId": chatID})
}

func (s *Server) mcpAddReaction(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return s.mcpToggleReaction(ctx, request, true)
}

func (s *Server) mcpRemoveReaction(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return s.mcpToggleReaction(ctx, request, false)
}

func (s *Server) mcpToggleReaction(ctx context.Context, request mcp.CallToolRequest, add bool) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	emoji, err := request.RequireString("emoji")
	if err != nil || strings.TrimSpace(emoji) == "" {
		return s.mcpToolError("emoji is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesReact, nil)
	if deny != nil {
		return deny, nil
	}
	chatID, err := s.pins.MessageChatID(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	if err := s.requireMCPChatAllowed(connector, chatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	message, reactErr := s.setMessageReaction(ctx, actor, messageID, strings.TrimSpace(emoji), add)
	if reactErr != nil {
		msg := reactErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesReact, &chatID, &messageID, true, nil, map[string]any{"add": add})
	return s.mcpToolJSON(message)
}

func (s *Server) mcpForwardMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	targetChatID, err := request.RequireString("target_chat_id")
	if err != nil {
		return s.mcpToolError("target_chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesForward, nil)
	if deny != nil {
		return deny, nil
	}
	sourceChatID, err := s.pins.MessageChatID(ctx, messageID)
	if err != nil {
		return s.mcpToolError("message not found")
	}
	if err := s.requireMCPChatAllowed(connector, sourceChatID); err != nil {
		msg := "chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &sourceChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	if err := s.requireMCPChatAllowed(connector, targetChatID); err != nil {
		msg := "target chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	message, forwardErr := s.forwardMessage(ctx, actor, messageID, targetChatID)
	if forwardErr != nil {
		msg := forwardErr.Error()
		s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &messageID, false, &msg, nil)
		return s.mcpToolError(msg)
	}
	s.recordMCPAudit(ctx, connector, mcpPermMessagesForward, &targetChatID, &message.ID, true, nil, map[string]any{"sourceMessageId": messageID})
	return s.mcpToolJSON(message)
}

func (s *Server) mcpPinMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesPin, &chatID)
	if deny != nil {
		return deny, nil
	}
	fetchedChatID, err := s.pins.MessageChatID(ctx, messageID)
	if err != nil || fetchedChatID != chatID {
		return s.mcpToolError("message not found")
	}
	if _, err := s.buildChatPublic(chatID, actor); err != nil {
		return s.mcpToolError("chat not found")
	}
	pin, _, err := s.pins.Pin(ctx, chatID, messageID, actor.ID)
	if err != nil {
		return s.mcpToolError("failed to pin message")
	}
	message, err := s.buildMessage(messageID, actor.ID)
	if err != nil {
		return s.mcpToolError("failed to load pinned message")
	}
	pinned := pinnedMessagePublic{
		ChatID:    chatID,
		MessageID: messageID,
		PinnedBy:  pin.PinnedBy,
		PinnedAt:  pin.PinnedAt,
		Message:   message,
	}
	s.emitMessagePinned(chatID, pinned)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesPin, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(pinned)
}

func (s *Server) mcpUnpinMessage(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	messageID, err := request.RequireString("message_id")
	if err != nil {
		return s.mcpToolError("message_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermMessagesUnpin, &chatID)
	if deny != nil {
		return deny, nil
	}
	if _, err := s.buildChatPublic(chatID, actor); err != nil {
		return s.mcpToolError("chat not found")
	}
	if _, err := s.pins.Get(ctx, chatID, messageID); err != nil {
		return s.mcpToolError("pin not found")
	}
	if err := s.pins.Delete(ctx, chatID, messageID); err != nil {
		return s.mcpToolError("failed to unpin message")
	}
	s.emitMessageUnpinned(chatID, messageID)
	s.recordMCPAudit(ctx, connector, mcpPermMessagesUnpin, &chatID, &messageID, true, nil, nil)
	return s.mcpToolJSON(map[string]string{"chatId": chatID, "messageId": messageID})
}

func (s *Server) mcpListChatFiles(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	chatID, err := request.RequireString("chat_id")
	if err != nil {
		return s.mcpToolError("chat_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermFilesList, &chatID)
	if deny != nil {
		return deny, nil
	}
	limit := request.GetInt("limit", connector.MaxHistoryMessages)
	if limit < 1 || limit > connector.MaxHistoryMessages {
		limit = connector.MaxHistoryMessages
	}
	fileIDs, err := s.fileListing.ChatFileIDs(ctx, connector.FamilyID, chatID, limit)
	if err != nil {
		return s.mcpToolError("could not list files")
	}
	files := make([]filePublic, 0)
	for _, fileID := range fileIDs {
		file, buildErr := s.buildFilePublic(fileID, actor.ID)
		if buildErr == nil && file.DeletedAt == nil && s.fileVisibleToUser(ctx, file, actor) {
			files = append(files, file)
		}
	}
	s.recordMCPAudit(ctx, connector, mcpPermFilesList, &chatID, nil, true, nil, map[string]any{"count": len(files)})
	return s.mcpToolJSON(map[string]any{"files": files})
}

func (s *Server) mcpGetFileDownloadLink(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	fileID, err := request.RequireString("file_id")
	if err != nil {
		return s.mcpToolError("file_id is required")
	}
	connector, actor, deny := s.mcpRequire(ctx, mcpPermFilesDownload, nil)
	if deny != nil {
		return deny, nil
	}
	file, _, loadErr := s.loadFileRecord(ctx, fileID, actor.ID)
	if loadErr != nil || file.DeletedAt != nil || !s.fileVisibleToUser(ctx, file, actor) {
		return s.mcpToolError("file not found")
	}
	if file.ChatID == nil {
		msg := "file is not scoped to an allowed chat"
		s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, nil, nil, false, &msg, map[string]any{"fileId": fileID})
		return s.mcpToolError(msg)
	}
	if err := s.requireMCPChatAllowed(connector, *file.ChatID); err != nil {
		msg := "file chat is not allowed for this connector"
		s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, file.ChatID, nil, false, &msg, map[string]any{"fileId": fileID})
		return s.mcpToolError(msg)
	}

	family, err := s.getFamily(connector.FamilyID)
	base := strings.TrimRight(s.cfg.AppURL, "/")
	if err == nil {
		settings := publicAccessSettingsForFamily(family, s.cfg.AppURL, s.cfg.APIURL)
		if settings.AppURL != "" {
			base = settings.AppURL
		}
	}

	var downloadURL string
	var expiresAt time.Time
	token, exp, mintErr := s.mintMediaPlaybackToken(actor.ID, actor.FamilyID, file.ID)
	if mintErr != nil {
		return s.mcpToolError("could not mint download token")
	}
	expiresAt = exp
	downloadURL = fmt.Sprintf("%s/api/media/%s?token=%s", strings.TrimRight(base, "/"), url.PathEscape(file.ID), url.QueryEscape(token))

	s.recordMCPAudit(ctx, connector, mcpPermFilesDownload, file.ChatID, nil, true, nil, map[string]any{"fileId": fileID})
	return s.mcpToolJSON(map[string]any{
		"fileId":      file.ID,
		"fileName":    file.OriginalName,
		"mimeType":    file.MimeType,
		"downloadUrl": downloadURL,
		"expiresAt":   expiresAt.UTC().Format(time.RFC3339),
	})
}
