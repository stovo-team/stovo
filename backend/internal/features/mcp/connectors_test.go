package mcp

import (
	"context"
	"errors"
	"testing"
)

type connectorStoreFake struct {
	create ConnectorCreate
	update ConnectorUpdate
	revoke ConnectorRevoke
	taken  bool
	row    Connector
	err    error
}

func (s *connectorStoreFake) AliasTaken(_ context.Context, _, _, _ string) (bool, error) {
	return s.taken, s.err
}
func (s *connectorStoreFake) ByTokenHash(context.Context, string) (Connector, error) {
	return s.row, s.err
}
func (s *connectorStoreFake) ByID(context.Context, string, string) (Connector, error) {
	return s.row, s.err
}
func (s *connectorStoreFake) List(context.Context, string) ([]Connector, error) {
	return []Connector{s.row}, s.err
}
func (s *connectorStoreFake) ChatIDs(context.Context, string) ([]string, error) {
	return []string{"chat"}, s.err
}
func (s *connectorStoreFake) TouchLastUsed(context.Context, string, string) error { return s.err }
func (s *connectorStoreFake) ChatFamilyID(context.Context, string) (string, error) {
	return "family", s.err
}
func (s *connectorStoreFake) CreateConnector(_ context.Context, command ConnectorCreate) error {
	s.create = command
	return s.err
}
func (s *connectorStoreFake) UpdateConnector(_ context.Context, command ConnectorUpdate) error {
	s.update = command
	return s.err
}
func (s *connectorStoreFake) RegenerateToken(_ context.Context, _, _, _ string) error { return s.err }
func (s *connectorStoreFake) RevokeConnector(_ context.Context, command ConnectorRevoke) error {
	s.revoke = command
	return s.err
}
func TestConnectorServiceDelegatesCommands(t *testing.T) {
	store := &connectorStoreFake{}
	service := NewConnectorService(store)
	store.row = Connector{ID: "connector"}
	if got, err := service.ByTokenHash(context.Background(), "hash"); err != nil || got.ID != "connector" {
		t.Fatalf("connector=%+v err=%v", got, err)
	}
	if err := service.Create(context.Background(), ConnectorCreate{ID: "connector"}); err != nil || store.create.ID != "connector" {
		t.Fatalf("create=%+v err=%v", store.create, err)
	}
	if err := service.Update(context.Background(), ConnectorUpdate{ConnectorID: "connector"}); err != nil || store.update.ConnectorID != "connector" {
		t.Fatalf("update=%+v err=%v", store.update, err)
	}
	if err := service.Revoke(context.Background(), ConnectorRevoke{ConnectorID: "connector"}); err != nil || store.revoke.ConnectorID != "connector" {
		t.Fatalf("revoke=%+v err=%v", store.revoke, err)
	}
	store.err = errors.New("store failed")
	if _, err := service.AliasTaken(context.Background(), "family", "alias", ""); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}

func TestConnectorServiceAuthorizeTokenHash(t *testing.T) {
	store := &connectorStoreFake{row: Connector{ID: "connector", Enabled: true}}
	service := NewConnectorService(store)

	connector, chatIDs, err := service.AuthorizeTokenHash(context.Background(), "hash")
	if err != nil || connector.ID != "connector" || len(chatIDs) != 1 || chatIDs[0] != "chat" {
		t.Fatalf("connector=%+v chats=%v err=%v", connector, chatIDs, err)
	}

	store.row.Enabled = false
	if _, _, err := service.AuthorizeTokenHash(context.Background(), "hash"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("disabled connector error=%v", err)
	}

	store.row.Enabled = true
	revoked := "2026-01-01T00:00:00Z"
	store.row.RevokedAt = &revoked
	if _, _, err := service.AuthorizeTokenHash(context.Background(), "hash"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("revoked connector error=%v", err)
	}
}
