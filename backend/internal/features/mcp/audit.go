// Package mcp contains framework-independent connector use cases.
package mcp

import (
	"context"
	"encoding/json"
	"time"
)

type AuditRecord struct {
	ID, FamilyID, ConnectorID, ActorUserID, Action, CreatedAt string
	ChatID, MessageID, Error                                  *string
	Success                                                   bool
	Meta                                                      json.RawMessage
}

type AuditEvent struct {
	ID, ConnectorID, ActorUserID, Action string
	ChatID, MessageID, Error             *string
	Success                              bool
	Meta                                 json.RawMessage
	CreatedAt                            time.Time
}

type AuditStore interface {
	RecordAudit(context.Context, AuditRecord) error
	ListAudit(context.Context, string, string, int) ([]AuditEvent, error)
}

type AuditService struct{ store AuditStore }

func NewAuditService(store AuditStore) *AuditService { return &AuditService{store: store} }

func (s *AuditService) Record(ctx context.Context, record AuditRecord) error {
	if len(record.Meta) == 0 {
		record.Meta = json.RawMessage(`{}`)
	}
	return s.store.RecordAudit(ctx, record)
}

func (s *AuditService) List(ctx context.Context, familyID, connectorID string, limit int) ([]AuditEvent, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	return s.store.ListAudit(ctx, familyID, connectorID, limit)
}
