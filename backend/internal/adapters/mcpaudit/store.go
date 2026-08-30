// Package mcpaudit adapts connector audit persistence to the MCP feature port.
package mcpaudit

import (
	"context"
	"encoding/json"
	"time"

	"stovo-messenger/backend/ent"
	featuremcp "stovo-messenger/backend/internal/features/mcp"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) RecordAudit(ctx context.Context, record featuremcp.AuditRecord) error {
	return s.repository.InsertMCPAuditEvent(ctx, repository.InsertMCPAuditEventParams{
		ID: record.ID, FamilyID: record.FamilyID, ConnectorID: record.ConnectorID, ActorUserID: record.ActorUserID,
		Action: record.Action, ChatID: record.ChatID, MessageID: record.MessageID, Success: record.Success,
		Error: record.Error, Meta: string(record.Meta), CreatedAt: record.CreatedAt,
	})
}

func (s *Store) ListAudit(ctx context.Context, familyID, connectorID string, limit int) ([]featuremcp.AuditEvent, error) {
	rows, err := s.repository.ListMCPAuditEvents(ctx, familyID, connectorID, limit)
	if err != nil {
		return nil, err
	}
	events := make([]featuremcp.AuditEvent, 0, len(rows))
	for _, row := range rows {
		events = append(events, auditEvent(row))
	}
	return events, nil
}

func auditEvent(row *ent.McpAuditEvent) featuremcp.AuditEvent {
	event := featuremcp.AuditEvent{
		ID: row.ID, ConnectorID: row.ConnectorID, ActorUserID: row.ActorUserID, Action: row.Action,
		Success: row.Success, CreatedAt: parseTime(row.CreatedAt), ChatID: row.ChatID, MessageID: row.MessageID, Error: row.Error,
	}
	if row.Meta != "" {
		event.Meta = append(json.RawMessage(nil), row.Meta...)
	}
	return event
}

func parseTime(value string) (parsedTime time.Time) {
	parsedTime, _ = time.Parse(time.RFC3339Nano, value)
	if parsedTime.IsZero() {
		parsedTime, _ = time.Parse(time.RFC3339, value)
	}
	return parsedTime
}
