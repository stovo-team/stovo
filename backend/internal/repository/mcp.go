package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"family-messenger/backend/ent"
	"family-messenger/backend/ent/chatmember"
	"family-messenger/backend/ent/mcpauditevent"
	"family-messenger/backend/ent/mcpconnector"
	"family-messenger/backend/ent/mcpconnectorchat"
)

// GetMCPConnectorByTokenHash loads a connector by token hash.
func (s *Store) GetMCPConnectorByTokenHash(ctx context.Context, hash string) (*ent.McpConnector, error) {
	return s.Client.McpConnector.Query().
		Where(mcpconnector.TokenHashEQ(hash)).
		Only(ctx)
}

// GetMCPConnectorByID loads a connector scoped to a family.
func (s *Store) GetMCPConnectorByID(ctx context.Context, familyID, connectorID string) (*ent.McpConnector, error) {
	return s.Client.McpConnector.Query().
		Where(
			mcpconnector.IDEQ(connectorID),
			mcpconnector.FamilyIDEQ(familyID),
		).
		Only(ctx)
}

// MCPConnectorAliasForActor returns the configured mention alias for an actor.
func (s *Store) MCPConnectorAliasForActor(ctx context.Context, actorUserID string) (string, error) {
	connector, err := s.Client.McpConnector.Query().
		Where(mcpconnector.ActorUserIDEQ(actorUserID), mcpconnector.RevokedAtIsNil()).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return connector.Alias, nil
}

// ListMCPConnectors returns connectors for a family ordered by created_at desc.
func (s *Store) ListMCPConnectors(ctx context.Context, familyID string) ([]*ent.McpConnector, error) {
	return s.Client.McpConnector.Query().
		Where(mcpconnector.FamilyIDEQ(familyID)).
		Order(mcpconnector.ByCreatedAt(sql.OrderDesc())).
		All(ctx)
}

// ListMCPConnectorChatIDs returns allowed chat ids for a connector.
func (s *Store) ListMCPConnectorChatIDs(ctx context.Context, connectorID string) ([]string, error) {
	rows, err := s.Client.McpConnectorChat.Query().
		Where(mcpconnectorchat.IDEQ(connectorID)).
		Order(mcpconnectorchat.ByChatID(sql.OrderAsc())).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ChatID)
	}
	return ids, nil
}

// TouchMCPConnectorLastUsed updates last_used_at for a connector.
func (s *Store) TouchMCPConnectorLastUsed(ctx context.Context, connectorID, lastUsedAt string) error {
	_, err := s.Client.McpConnector.UpdateOneID(connectorID).
		SetLastUsedAt(lastUsedAt).
		Save(ctx)
	return err
}

// GetChatFamilyAndType returns family_id and type for a chat.
func (s *Store) GetChatFamilyAndType(ctx context.Context, chatID string) (familyID, chatType string, err error) {
	c, err := s.Client.Chat.Get(ctx, chatID)
	if err != nil {
		return "", "", err
	}
	return c.FamilyID, c.Type, nil
}

// GetChatFamilyID returns family_id for a chat.
func (s *Store) GetChatFamilyID(ctx context.Context, chatID string) (string, error) {
	c, err := s.Client.Chat.Get(ctx, chatID)
	if err != nil {
		return "", err
	}
	return c.FamilyID, nil
}

// CreateMCPConnectorActorUserParams holds fields for the connector actor user.
type CreateMCPConnectorActorUserParams struct {
	ID           string
	FamilyID     string
	Username     string
	PasswordHash string
	DisplayName  string
	Role         string
	CreatedAt    string
}

// CreateMCPConnectorActorUser inserts an inactive connector actor user.
func (s *Store) CreateMCPConnectorActorUser(ctx context.Context, tx *ent.Tx, p CreateMCPConnectorActorUserParams) error {
	_, err := s.client(tx).User.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetUsername(p.Username).
		SetPasswordHash(p.PasswordHash).
		SetDisplayName(p.DisplayName).
		SetRole(p.Role).
		SetIsActive(0).
		SetCreatedAt(p.CreatedAt).
		Save(ctx)
	return err
}

// CreateMCPConnectorParams holds fields for inserting an MCP connector.
type CreateMCPConnectorParams struct {
	ID                 string
	FamilyID           string
	Name               string
	ActorUserID        string
	TokenHash          string
	CreatedBy          string
	CreatedAt          string
	MaxHistoryMessages int
	Permissions        string
	Provider           string
	Alias              string
	AuthMode           string
}

// CreateMCPConnector inserts an enabled MCP connector.
func (s *Store) CreateMCPConnector(ctx context.Context, tx *ent.Tx, p CreateMCPConnectorParams) error {
	_, err := s.client(tx).McpConnector.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetName(p.Name).
		SetActorUserID(p.ActorUserID).
		SetTokenHash(p.TokenHash).
		SetEnabled(true).
		SetCreatedBy(p.CreatedBy).
		SetCreatedAt(p.CreatedAt).
		SetMaxHistoryMessages(p.MaxHistoryMessages).
		SetPermissions(p.Permissions).
		SetProvider(p.Provider).
		SetAlias(p.Alias).
		SetAuthMode(p.AuthMode).
		Save(ctx)
	return err
}

// UpdateMCPConnectorParams holds fields for updating an MCP connector.
type UpdateMCPConnectorParams struct {
	ConnectorID        string
	FamilyID           string
	Name               string
	Enabled            bool
	MaxHistoryMessages int
	Permissions        string
	Alias              string
	AuthMode           string
}

// UpdateMCPConnector updates connector settings scoped to a family.
func (s *Store) UpdateMCPConnector(ctx context.Context, tx *ent.Tx, p UpdateMCPConnectorParams) error {
	_, err := s.client(tx).McpConnector.Update().
		Where(
			mcpconnector.IDEQ(p.ConnectorID),
			mcpconnector.FamilyIDEQ(p.FamilyID),
		).
		SetName(p.Name).
		SetEnabled(p.Enabled).
		SetMaxHistoryMessages(p.MaxHistoryMessages).
		SetPermissions(p.Permissions).
		SetAlias(p.Alias).
		SetAuthMode(p.AuthMode).
		Save(ctx)
	return err
}

// MCPAliasTaken reports whether another active connector in the family already uses the alias.
func (s *Store) MCPAliasTaken(ctx context.Context, familyID, alias, excludeConnectorID string) (bool, error) {
	query := s.Client.McpConnector.Query().Where(
		mcpconnector.FamilyIDEQ(familyID),
		mcpconnector.AliasEQ(alias),
		mcpconnector.RevokedAtIsNil(),
	)
	if excludeConnectorID != "" {
		query = query.Where(mcpconnector.IDNEQ(excludeConnectorID))
	}
	return query.Exist(ctx)
}

// UpdateUserDisplayName sets display_name for a user inside a transaction.
func (s *Store) UpdateUserDisplayName(ctx context.Context, tx *ent.Tx, userID, displayName string) error {
	_, err := s.client(tx).User.UpdateOneID(userID).SetDisplayName(displayName).Save(ctx)
	return err
}

// RegenerateMCPConnectorToken updates token hash and re-enables a connector.
func (s *Store) RegenerateMCPConnectorToken(ctx context.Context, connectorID, familyID, tokenHash string) error {
	_, err := s.Client.McpConnector.Update().
		Where(
			mcpconnector.IDEQ(connectorID),
			mcpconnector.FamilyIDEQ(familyID),
		).
		SetTokenHash(tokenHash).
		SetEnabled(true).
		Save(ctx)
	return err
}

// RevokeMCPConnectorParams holds fields for revoking a connector.
type RevokeMCPConnectorParams struct {
	ConnectorID string
	FamilyID    string
	RevokedAt   string
	TokenHash   string
	DisplayName string
	ActorUserID string
}

// RevokeMCPConnector disables a connector, clears chats/memberships, and deactivates the actor user.
func (s *Store) RevokeMCPConnector(ctx context.Context, tx *ent.Tx, p RevokeMCPConnectorParams) error {
	c := s.client(tx)
	if _, err := c.McpConnector.Update().
		Where(
			mcpconnector.IDEQ(p.ConnectorID),
			mcpconnector.FamilyIDEQ(p.FamilyID),
		).
		SetEnabled(false).
		SetRevokedAt(p.RevokedAt).
		SetTokenHash(p.TokenHash).
		Save(ctx); err != nil {
		return err
	}
	if _, err := c.McpConnectorChat.Delete().
		Where(mcpconnectorchat.IDEQ(p.ConnectorID)).
		Exec(ctx); err != nil {
		return err
	}
	if _, err := c.ChatMember.Delete().
		Where(chatmember.UserIDEQ(p.ActorUserID)).
		Exec(ctx); err != nil {
		return err
	}
	_, err := c.User.UpdateOneID(p.ActorUserID).
		SetIsActive(0).
		SetDisplayName(p.DisplayName).
		Save(ctx)
	return err
}

// SyncMCPConnectorChats replaces connector chat bindings and actor memberships.
func (s *Store) SyncMCPConnectorChats(ctx context.Context, tx *ent.Tx, connectorID, actorUserID string, chatIDs []string, memberCreatedAt string) error {
	c := s.client(tx)
	if _, err := c.McpConnectorChat.Delete().
		Where(mcpconnectorchat.IDEQ(connectorID)).
		Exec(ctx); err != nil {
		return err
	}
	if _, err := c.ChatMember.Delete().
		Where(chatmember.UserIDEQ(actorUserID)).
		Exec(ctx); err != nil {
		return err
	}
	for _, chatID := range chatIDs {
		if _, err := c.McpConnectorChat.Create().
			SetID(connectorID).
			SetChatID(chatID).
			Save(ctx); err != nil {
			return err
		}
		if err := c.ChatMember.Create().
			SetID(chatID).
			SetUserID(actorUserID).
			SetCreatedAt(memberCreatedAt).
			OnConflictColumns(chatmember.FieldID, chatmember.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
	}
	return nil
}

// InsertMCPAuditEventParams holds fields for an MCP audit event.
type InsertMCPAuditEventParams struct {
	ID          string
	FamilyID    string
	ConnectorID string
	ActorUserID string
	Action      string
	ChatID      *string
	MessageID   *string
	Success     bool
	Error       *string
	Meta        string
	CreatedAt   string
}

// InsertMCPAuditEvent inserts an MCP audit event row.
func (s *Store) InsertMCPAuditEvent(ctx context.Context, p InsertMCPAuditEventParams) error {
	create := s.Client.McpAuditEvent.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetConnectorID(p.ConnectorID).
		SetActorUserID(p.ActorUserID).
		SetAction(p.Action).
		SetSuccess(p.Success).
		SetMeta(p.Meta).
		SetCreatedAt(p.CreatedAt)
	if p.ChatID != nil {
		create.SetChatID(*p.ChatID)
	}
	if p.MessageID != nil {
		create.SetMessageID(*p.MessageID)
	}
	if p.Error != nil {
		create.SetError(*p.Error)
	}
	_, err := create.Save(ctx)
	return err
}

// ListMCPAuditEvents returns audit events for a connector ordered by created_at desc.
func (s *Store) ListMCPAuditEvents(ctx context.Context, familyID, connectorID string, limit int) ([]*ent.McpAuditEvent, error) {
	return s.Client.McpAuditEvent.Query().
		Where(
			mcpauditevent.FamilyIDEQ(familyID),
			mcpauditevent.ConnectorIDEQ(connectorID),
		).
		Order(mcpauditevent.ByCreatedAt(sql.OrderDesc())).
		Limit(limit).
		All(ctx)
}
