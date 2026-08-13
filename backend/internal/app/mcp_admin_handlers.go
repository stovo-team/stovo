package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (s *Server) handleListMCPConnectors(w http.ResponseWriter, _ *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connectors, err := s.listMCPConnectors(user.FamilyID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load MCP connectors")
		return
	}
	s.json(w, http.StatusOK, connectors)
}

func (s *Server) handleGetMCPConnector(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connector, err := s.loadMCPConnectorByID(user.FamilyID, chi.URLParam(r, "connectorId"))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Connector not found")
		return
	}
	s.json(w, http.StatusOK, connector.toPublic())
}

func (s *Server) handleCreateMCPConnector(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	var payload mcpConnectorCreateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		s.detail(w, http.StatusUnprocessableEntity, "name is required")
		return
	}
	if len(name) > 120 {
		s.detail(w, http.StatusUnprocessableEntity, "name is too long")
		return
	}
	provider := normalizeMCPProvider(payload.Provider)
	if provider == "" {
		s.detail(w, http.StatusUnprocessableEntity, "provider must be claude_code, codex, openclaw, or hermes")
		return
	}
	alias, err := normalizeMCPAlias(payload.Alias, provider)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	authMode := normalizeMCPAuthMode(payload.AuthMode)
	if authMode == "" {
		s.detail(w, http.StatusUnprocessableEntity, "authMode must be subscription or api")
		return
	}
	if taken, takeErr := s.store.MCPAliasTaken(r.Context(), user.FamilyID, alias, ""); takeErr != nil {
		s.logger.Errorf("mcp", "alias validation failed family=%s alias=%s error=%v", user.FamilyID, alias, takeErr)
		s.detail(w, http.StatusInternalServerError, "Could not validate alias")
		return
	} else if taken {
		s.detail(w, http.StatusConflict, "alias is already used by another connector")
		return
	}
	historyLimit := mcpDefaultMaxHistory
	if payload.MaxHistoryMessages != nil {
		historyLimit = clampMCPHistoryLimit(*payload.MaxHistoryMessages)
	}
	permissions := normalizeMCPPermissions(payload.Permissions)
	chatIDs, err := s.validateMCPAllowedChats(user.FamilyID, payload.AllowedChatIDs)
	if err != nil {
		s.detail(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	rawToken, err := randomToken()
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not generate connector token")
		return
	}
	tokenHashValue := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	connectorID := uuid.NewString()
	actorUserID := uuid.NewString()
	now := nowString()

	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		passwordHash, hashErr := hashPassword(uuid.NewString() + uuid.NewString())
		if hashErr != nil {
			return hashErr
		}
		username := fmt.Sprintf("mcp_%s", strings.ReplaceAll(connectorID, "-", ""))
		if len(username) > 60 {
			username = username[:60]
		}
		if err := s.store.CreateMCPConnectorActorUser(r.Context(), tx, repository.CreateMCPConnectorActorUserParams{
			ID:           actorUserID,
			FamilyID:     user.FamilyID,
			Username:     username,
			PasswordHash: passwordHash,
			DisplayName:  name,
			Role:         connectorRole,
			CreatedAt:    now,
		}); err != nil {
			return err
		}
		permsJSON, _ := json.Marshal(permissions)
		if err := s.store.CreateMCPConnector(r.Context(), tx, repository.CreateMCPConnectorParams{
			ID:                 connectorID,
			FamilyID:           user.FamilyID,
			Name:               name,
			ActorUserID:        actorUserID,
			TokenHash:          tokenHashValue,
			CreatedBy:          user.ID,
			CreatedAt:          now,
			MaxHistoryMessages: historyLimit,
			Permissions:        string(permsJSON),
			Provider:           provider,
			Alias:              alias,
			AuthMode:           authMode,
		}); err != nil {
			return err
		}
		return s.store.SyncMCPConnectorChats(r.Context(), tx, connectorID, actorUserID, chatIDs, now)
	}); err != nil {
		s.logger.Errorf("mcp", "create connector failed family=%s error=%v", user.FamilyID, err)
		s.detail(w, http.StatusInternalServerError, "Could not create MCP connector")
		return
	}

	connector, err := s.loadMCPConnectorByID(user.FamilyID, connectorID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load created connector")
		return
	}
	mcpURL, command, setupPrompt := s.mcpConnectArtifactsForURL(s.mcpBaseURLForRequest(r), provider, authMode, alias, name, rawToken)
	s.recordMCPAudit(r.Context(), connector, "connector.create", nil, nil, true, nil, map[string]any{
		"name":     name,
		"provider": provider,
		"alias":    alias,
		"authMode": authMode,
	})
	s.json(w, http.StatusCreated, mcpConnectorCreateResponse{
		Connector:     connector.toPublic(),
		Token:         rawToken,
		MCPURL:        mcpURL,
		ClaudeCommand: command,
		SetupPrompt:   setupPrompt,
		CLICommand:    command,
	})
}

func (s *Server) handleUpdateMCPConnector(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connector, err := s.loadMCPConnectorByID(user.FamilyID, chi.URLParam(r, "connectorId"))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Connector not found")
		return
	}
	if connector.RevokedAt != nil {
		s.detail(w, http.StatusConflict, "Connector is revoked")
		return
	}

	var payload mcpConnectorUpdateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.detail(w, http.StatusUnprocessableEntity, "Invalid request body")
		return
	}

	name := connector.Name
	if payload.Name != nil {
		name = strings.TrimSpace(*payload.Name)
		if name == "" {
			s.detail(w, http.StatusUnprocessableEntity, "name is required")
			return
		}
		if len(name) > 120 {
			s.detail(w, http.StatusUnprocessableEntity, "name is too long")
			return
		}
	}
	alias := connector.Alias
	if payload.Alias != nil {
		normalizedAlias, aliasErr := normalizeMCPAlias(*payload.Alias, connector.Provider)
		if aliasErr != nil {
			s.detail(w, http.StatusUnprocessableEntity, aliasErr.Error())
			return
		}
		alias = normalizedAlias
		if taken, takeErr := s.store.MCPAliasTaken(r.Context(), user.FamilyID, alias, connector.ID); takeErr != nil {
			s.logger.Errorf("mcp", "alias validation failed family=%s alias=%s connector=%s error=%v", user.FamilyID, alias, connector.ID, takeErr)
			s.detail(w, http.StatusInternalServerError, "Could not validate alias")
			return
		} else if taken {
			s.detail(w, http.StatusConflict, "alias is already used by another connector")
			return
		}
	}
	authMode := connector.AuthMode
	if authMode == "" {
		authMode = mcpAuthModeSubscription
	}
	if payload.AuthMode != nil {
		normalizedMode := normalizeMCPAuthMode(*payload.AuthMode)
		if normalizedMode == "" {
			s.detail(w, http.StatusUnprocessableEntity, "authMode must be subscription or api")
			return
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
		validated, validateErr := s.validateMCPAllowedChats(user.FamilyID, *payload.AllowedChatIDs)
		if validateErr != nil {
			s.detail(w, http.StatusUnprocessableEntity, validateErr.Error())
			return
		}
		chatIDs = validated
	}

	permsJSON, _ := json.Marshal(permissions)
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		if err := s.store.UpdateMCPConnector(r.Context(), tx, repository.UpdateMCPConnectorParams{
			ConnectorID:        connector.ID,
			FamilyID:           user.FamilyID,
			Name:               name,
			Enabled:            enabled,
			MaxHistoryMessages: historyLimit,
			Permissions:        string(permsJSON),
			Alias:              alias,
			AuthMode:           authMode,
		}); err != nil {
			return err
		}
		if err := s.store.UpdateUserDisplayName(r.Context(), tx, connector.ActorUserID, name); err != nil {
			return err
		}
		return s.store.SyncMCPConnectorChats(r.Context(), tx, connector.ID, connector.ActorUserID, chatIDs, nowString())
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not update MCP connector")
		return
	}

	updated, err := s.loadMCPConnectorByID(user.FamilyID, connector.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load updated connector")
		return
	}
	s.recordMCPAudit(r.Context(), updated, "connector.update", nil, nil, true, nil, map[string]any{"enabled": enabled})
	s.json(w, http.StatusOK, updated.toPublic())
}

func (s *Server) handleRegenerateMCPConnectorToken(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connector, err := s.loadMCPConnectorByID(user.FamilyID, chi.URLParam(r, "connectorId"))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Connector not found")
		return
	}
	if connector.RevokedAt != nil {
		s.detail(w, http.StatusConflict, "Connector is revoked")
		return
	}
	rawToken, err := randomToken()
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not generate connector token")
		return
	}
	tokenHashValue := tokenHash(s.cfg.RefreshTokenSecret, rawToken)
	if err := s.store.RegenerateMCPConnectorToken(r.Context(), connector.ID, user.FamilyID, tokenHashValue); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not regenerate token")
		return
	}
	updated, err := s.loadMCPConnectorByID(user.FamilyID, connector.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load connector")
		return
	}
	mcpURL, command, setupPrompt := s.mcpConnectArtifactsForURL(s.mcpBaseURLForRequest(r), updated.Provider, updated.AuthMode, updated.Alias, updated.Name, rawToken)
	s.recordMCPAudit(r.Context(), updated, "connector.regenerate_token", nil, nil, true, nil, nil)
	s.json(w, http.StatusOK, mcpConnectorTokenResponse{
		Connector:     updated.toPublic(),
		Token:         rawToken,
		MCPURL:        mcpURL,
		ClaudeCommand: command,
		SetupPrompt:   setupPrompt,
		CLICommand:    command,
	})
}

func (s *Server) handleRevokeMCPConnector(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connector, err := s.loadMCPConnectorByID(user.FamilyID, chi.URLParam(r, "connectorId"))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Connector not found")
		return
	}
	if connector.RevokedAt != nil {
		s.json(w, http.StatusOK, connector.toPublic())
		return
	}
	now := nowString()
	if err := s.store.WithTx(r.Context(), func(tx *ent.Tx) error {
		return s.store.RevokeMCPConnector(r.Context(), tx, repository.RevokeMCPConnectorParams{
			ConnectorID: connector.ID,
			FamilyID:    user.FamilyID,
			RevokedAt:   now,
			TokenHash:   "revoked:" + uuid.NewString(),
			DisplayName: connector.Name + " (revoked)",
			ActorUserID: connector.ActorUserID,
		})
	}); err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not revoke connector")
		return
	}
	updated, _ := s.loadMCPConnectorByID(user.FamilyID, connector.ID)
	s.recordMCPAudit(r.Context(), connector, "connector.revoke", nil, nil, true, nil, nil)
	s.json(w, http.StatusOK, updated.toPublic())
}

func (s *Server) handleListMCPConnectorAudit(w http.ResponseWriter, r *http.Request, user userPublic) {
	if err := s.requireAdmin(user); err != nil {
		s.detail(w, http.StatusForbidden, "Admin access required")
		return
	}
	connector, err := s.loadMCPConnectorByID(user.FamilyID, chi.URLParam(r, "connectorId"))
	if err != nil {
		s.detail(w, http.StatusNotFound, "Connector not found")
		return
	}
	events, err := s.listMCPAuditEvents(user.FamilyID, connector.ID, 100)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Could not load audit events")
		return
	}
	s.json(w, http.StatusOK, events)
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
		chatFamilyID, _, err := s.store.GetChatFamilyAndType(context.Background(), chatID)
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

func (s *Server) mcpConnectCommand(familyID, rawToken string) (string, string) {
	mcpURL, command, _ := s.mcpConnectArtifacts(familyID, mcpProviderClaudeCode, mcpAuthModeSubscription, "claude", "stovo", rawToken)
	return mcpURL, command
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
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if serverID = strings.TrimSpace(serverID); serverID != "" && !strings.Contains(baseURL, "/s/") {
		baseURL += "/s/" + serverID
	}
	return baseURL + "/mcp"
}

func (s *Server) mcpConnectArtifacts(familyID, provider, authMode, alias, connectorName, rawToken string) (mcpURL, cliCommand, setupPrompt string) {
	return s.mcpConnectArtifactsForURL(s.mcpBaseURL(familyID), provider, authMode, alias, connectorName, rawToken)
}

func (s *Server) mcpConnectArtifactsForURL(mcpURL, provider, authMode, alias, connectorName, rawToken string) (string, string, string) {
	name := strings.TrimSpace(connectorName)
	if name == "" {
		name = "stovo"
	}
	if alias == "" {
		alias = defaultMCPAliasForProvider(provider)
	}
	if authMode == "" {
		authMode = mcpAuthModeSubscription
	}
	cliCommand := mcpCLICommandForProvider(provider, name, mcpURL, rawToken)
	setupPrompt := mcpSetupPromptForProvider(provider, authMode, alias, name, mcpURL, rawToken)
	return mcpURL, cliCommand, setupPrompt
}

func mcpCLICommandForProvider(provider, name, mcpURL, rawToken string) string {
	safeName := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(name)), " ", "-")
	if safeName == "" {
		safeName = "stovo"
	}
	switch normalizeMCPProvider(provider) {
	case mcpProviderCodex:
		return fmt.Sprintf(
			`codex mcp add %s --url %s --header "Authorization: Bearer %s"`,
			safeName,
			mcpURL,
			rawToken,
		)
	case mcpProviderOpenClaw, mcpProviderHermes:
		return fmt.Sprintf(
			"# Add HTTP MCP server %q\n# URL: %s\n# Header: Authorization: Bearer %s",
			name,
			mcpURL,
			rawToken,
		)
	default:
		return fmt.Sprintf(
			`claude mcp add --transport http --scope user %s %s --header "Authorization: Bearer %s"`,
			safeName,
			mcpURL,
			rawToken,
		)
	}
}

func mcpSetupPromptForProvider(provider, authMode, alias, name, mcpURL, rawToken string) string {
	authHint := "Use your existing app subscription for this agent (no Stovo-stored API key)."
	if normalizeMCPAuthMode(authMode) == mcpAuthModeAPI {
		authHint = "Configure this agent in API mode with your provider API key in the client app (Stovo still only stores the MCP bearer token)."
	}
	mention := "@" + alias
	switch normalizeMCPProvider(provider) {
	case mcpProviderCodex:
		return fmt.Sprintf(
			"Add an HTTP MCP server in ChatGPT / Codex settings named \"%s\" (mention alias %s). Use URL %s and set the Authorization header to Bearer %s. %s Save and enable it for this workspace.",
			name,
			mention,
			mcpURL,
			rawToken,
			authHint,
		)
	case mcpProviderOpenClaw:
		return fmt.Sprintf(
			"In OpenClaw, add a custom HTTP MCP connector named \"%s\" (mention alias %s). MCP URL: %s. Authorization: Bearer %s. %s Enable the connector after saving.",
			name,
			mention,
			mcpURL,
			rawToken,
			authHint,
		)
	case mcpProviderHermes:
		return fmt.Sprintf(
			"In Hermes, open Connectors / MCP and add a custom HTTP server named \"%s\" (mention alias %s). URL: %s. Header Authorization: Bearer %s. %s Save and turn it on.",
			name,
			mention,
			mcpURL,
			rawToken,
			authHint,
		)
	default:
		return fmt.Sprintf(
			"In Claude Code, open Settings → MCP and add a custom HTTP connector named \"%s\" (mention alias %s). Paste URL %s and set Authorization to Bearer %s. %s Save and enable it for this project.",
			name,
			mention,
			mcpURL,
			rawToken,
			authHint,
		)
	}
}
