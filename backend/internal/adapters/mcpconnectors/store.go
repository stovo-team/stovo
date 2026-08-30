// Package mcpconnectors adapts connector lifecycle persistence to the MCP
// feature without allowing Ent transactions into transport code.
package mcpconnectors

import (
	"context"
	"encoding/json"

	"stovo-messenger/backend/ent"
	featuremcp "stovo-messenger/backend/internal/features/mcp"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }
func (s *Store) AliasTaken(ctx context.Context, familyID, alias, excludingID string) (bool, error) {
	return s.repository.MCPAliasTaken(ctx, familyID, alias, excludingID)
}
func (s *Store) ByTokenHash(ctx context.Context, hash string) (featuremcp.Connector, error) {
	row, err := s.repository.GetMCPConnectorByTokenHash(ctx, hash)
	return connectorFromEnt(row), err
}
func (s *Store) ByID(ctx context.Context, familyID, connectorID string) (featuremcp.Connector, error) {
	row, err := s.repository.GetMCPConnectorByID(ctx, familyID, connectorID)
	return connectorFromEnt(row), err
}
func (s *Store) List(ctx context.Context, familyID string) ([]featuremcp.Connector, error) {
	rows, err := s.repository.ListMCPConnectors(ctx, familyID)
	if err != nil {
		return nil, err
	}
	connectors := make([]featuremcp.Connector, 0, len(rows))
	for _, row := range rows {
		connectors = append(connectors, connectorFromEnt(row))
	}
	return connectors, nil
}
func (s *Store) ChatIDs(ctx context.Context, connectorID string) ([]string, error) {
	return s.repository.ListMCPConnectorChatIDs(ctx, connectorID)
}
func (s *Store) TouchLastUsed(ctx context.Context, connectorID, usedAt string) error {
	return s.repository.TouchMCPConnectorLastUsed(ctx, connectorID, usedAt)
}
func (s *Store) ChatFamilyID(ctx context.Context, chatID string) (string, error) {
	return s.repository.GetChatFamilyID(ctx, chatID)
}
func (s *Store) CreateConnector(ctx context.Context, command featuremcp.ConnectorCreate) error {
	return s.repository.WithTx(ctx, func(tx *ent.Tx) error {
		if err := s.repository.CreateMCPConnectorActorUser(ctx, tx, repository.CreateMCPConnectorActorUserParams{ID: command.ActorUserID, FamilyID: command.FamilyID, Username: command.ActorUsername, PasswordHash: command.ActorPasswordHash, DisplayName: command.Name, Role: "connector", CreatedAt: command.CreatedAt}); err != nil {
			return err
		}
		permissions, err := json.Marshal(command.Permissions)
		if err != nil {
			return err
		}
		if err := s.repository.CreateMCPConnector(ctx, tx, repository.CreateMCPConnectorParams{ID: command.ID, FamilyID: command.FamilyID, Name: command.Name, ActorUserID: command.ActorUserID, TokenHash: command.TokenHash, CreatedBy: command.CreatedBy, CreatedAt: command.CreatedAt, MaxHistoryMessages: command.MaxHistoryMessages, Permissions: string(permissions), Provider: command.Provider, Alias: command.Alias, AuthMode: command.AuthMode}); err != nil {
			return err
		}
		return s.repository.SyncMCPConnectorChats(ctx, tx, command.ID, command.ActorUserID, command.ChatIDs, command.CreatedAt)
	})
}
func (s *Store) UpdateConnector(ctx context.Context, command featuremcp.ConnectorUpdate) error {
	return s.repository.WithTx(ctx, func(tx *ent.Tx) error {
		permissions, err := json.Marshal(command.Permissions)
		if err != nil {
			return err
		}
		if err := s.repository.UpdateMCPConnector(ctx, tx, repository.UpdateMCPConnectorParams{ConnectorID: command.ConnectorID, FamilyID: command.FamilyID, Name: command.Name, Enabled: command.Enabled, MaxHistoryMessages: command.MaxHistoryMessages, Permissions: string(permissions), Alias: command.Alias, AuthMode: command.AuthMode}); err != nil {
			return err
		}
		if err := s.repository.UpdateUserDisplayName(ctx, tx, command.ActorUserID, command.Name); err != nil {
			return err
		}
		return s.repository.SyncMCPConnectorChats(ctx, tx, command.ConnectorID, command.ActorUserID, command.ChatIDs, command.UpdatedAt)
	})
}
func (s *Store) RegenerateToken(ctx context.Context, connectorID, familyID, tokenHash string) error {
	return s.repository.RegenerateMCPConnectorToken(ctx, connectorID, familyID, tokenHash)
}
func (s *Store) RevokeConnector(ctx context.Context, command featuremcp.ConnectorRevoke) error {
	return s.repository.WithTx(ctx, func(tx *ent.Tx) error {
		return s.repository.RevokeMCPConnector(ctx, tx, repository.RevokeMCPConnectorParams{ConnectorID: command.ConnectorID, FamilyID: command.FamilyID, RevokedAt: command.RevokedAt, TokenHash: command.TokenHash, DisplayName: command.DisplayName, ActorUserID: command.ActorUserID})
	})
}

func connectorFromEnt(row *ent.McpConnector) featuremcp.Connector {
	if row == nil {
		return featuremcp.Connector{}
	}
	var permissions map[string]bool
	_ = json.Unmarshal([]byte(row.Permissions), &permissions)
	connector := featuremcp.Connector{ID: row.ID, FamilyID: row.FamilyID, Name: row.Name, ActorUserID: row.ActorUserID, TokenHash: row.TokenHash, Enabled: row.Enabled, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, MaxHistoryMessages: row.MaxHistoryMessages, Permissions: permissions, Provider: row.Provider, Alias: row.Alias, AuthMode: row.AuthMode}
	if row.RevokedAt != nil {
		value := *row.RevokedAt
		connector.RevokedAt = &value
	}
	if row.LastUsedAt != nil {
		value := *row.LastUsedAt
		connector.LastUsedAt = &value
	}
	return connector
}
