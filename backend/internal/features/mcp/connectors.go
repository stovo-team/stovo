package mcp

import (
	"context"
	"errors"
	"strings"
)

// ErrUnauthorized intentionally hides persistence failures and connector
// state details from inbound transports.
var ErrUnauthorized = errors.New("mcp connector unauthorized")

// Connector is the persistence-neutral view needed by MCP authorization and
// administrative transports. Times remain opaque here because formatting is a
// transport concern.
type Connector struct {
	ID, FamilyID, Name, ActorUserID, TokenHash, CreatedBy, CreatedAt string
	Enabled                                                          bool
	RevokedAt, LastUsedAt                                            *string
	MaxHistoryMessages                                               int
	Permissions                                                      map[string]bool
	Provider, Alias, AuthMode                                        string
}

// ConnectorCreate is an already-validated connector provision command. The
// port owns the atomic actor, connector, and chat-membership changes.
type ConnectorCreate struct {
	ID, FamilyID, Name, ActorUserID, ActorUsername, ActorPasswordHash string
	TokenHash, CreatedBy, CreatedAt, Provider, Alias, AuthMode        string
	MaxHistoryMessages                                                int
	Permissions                                                       map[string]bool
	ChatIDs                                                           []string
}

type ConnectorUpdate struct {
	ConnectorID, FamilyID, ActorUserID, Name, Alias, AuthMode, UpdatedAt string
	Enabled                                                              bool
	MaxHistoryMessages                                                   int
	Permissions                                                          map[string]bool
	ChatIDs                                                              []string
}

type ConnectorRevoke struct {
	ConnectorID, FamilyID, ActorUserID, RevokedAt, TokenHash, DisplayName string
}

type ConnectorStore interface {
	AliasTaken(context.Context, string, string, string) (bool, error)
	ByTokenHash(context.Context, string) (Connector, error)
	ByID(context.Context, string, string) (Connector, error)
	List(context.Context, string) ([]Connector, error)
	ChatIDs(context.Context, string) ([]string, error)
	TouchLastUsed(context.Context, string, string) error
	ChatFamilyID(context.Context, string) (string, error)
	CreateConnector(context.Context, ConnectorCreate) error
	UpdateConnector(context.Context, ConnectorUpdate) error
	RegenerateToken(context.Context, string, string, string) error
	RevokeConnector(context.Context, ConnectorRevoke) error
}

type ConnectorService struct{ store ConnectorStore }

func NewConnectorService(store ConnectorStore) *ConnectorService {
	return &ConnectorService{store: store}
}
func (s *ConnectorService) AliasTaken(ctx context.Context, familyID, alias, excludingID string) (bool, error) {
	return s.store.AliasTaken(ctx, familyID, alias, excludingID)
}
func (s *ConnectorService) ByTokenHash(ctx context.Context, hash string) (Connector, error) {
	return s.store.ByTokenHash(ctx, hash)
}

// AuthorizeTokenHash resolves an active connector and its allowed chats. The
// transport owns token extraction and hashing; this use case owns connector
// lifecycle policy so every inbound MCP transport observes the same boundary.
func (s *ConnectorService) AuthorizeTokenHash(ctx context.Context, hash string) (Connector, []string, error) {
	connector, err := s.store.ByTokenHash(ctx, hash)
	if err != nil || !connector.Enabled || (connector.RevokedAt != nil && strings.TrimSpace(*connector.RevokedAt) != "") {
		return Connector{}, nil, ErrUnauthorized
	}
	chatIDs, err := s.store.ChatIDs(ctx, connector.ID)
	if err != nil {
		return Connector{}, nil, ErrUnauthorized
	}
	return connector, chatIDs, nil
}
func (s *ConnectorService) ByID(ctx context.Context, familyID, connectorID string) (Connector, error) {
	return s.store.ByID(ctx, familyID, connectorID)
}
func (s *ConnectorService) List(ctx context.Context, familyID string) ([]Connector, error) {
	return s.store.List(ctx, familyID)
}
func (s *ConnectorService) ChatIDs(ctx context.Context, connectorID string) ([]string, error) {
	return s.store.ChatIDs(ctx, connectorID)
}
func (s *ConnectorService) TouchLastUsed(ctx context.Context, connectorID, usedAt string) error {
	return s.store.TouchLastUsed(ctx, connectorID, usedAt)
}
func (s *ConnectorService) ChatFamilyID(ctx context.Context, chatID string) (string, error) {
	return s.store.ChatFamilyID(ctx, chatID)
}
func (s *ConnectorService) Create(ctx context.Context, command ConnectorCreate) error {
	return s.store.CreateConnector(ctx, command)
}
func (s *ConnectorService) Update(ctx context.Context, command ConnectorUpdate) error {
	return s.store.UpdateConnector(ctx, command)
}
func (s *ConnectorService) RegenerateToken(ctx context.Context, connectorID, familyID, tokenHash string) error {
	return s.store.RegenerateToken(ctx, connectorID, familyID, tokenHash)
}
func (s *ConnectorService) Revoke(ctx context.Context, command ConnectorRevoke) error {
	return s.store.RevokeConnector(ctx, command)
}
