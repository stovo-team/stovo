package app

import (
	"context"
	"encoding/json"
	"strings"

	"family-messenger/backend/ent"
	"family-messenger/backend/internal/repository"

	"github.com/google/uuid"
)

func mcpAuditEventFromEnt(e *ent.McpAuditEvent) mcpAuditEventPublic {
	event := mcpAuditEventPublic{
		ID:          e.ID,
		ConnectorID: e.ConnectorID,
		ActorUserID: e.ActorUserID,
		Action:      e.Action,
		Success:     e.Success,
		CreatedAt:   parseTime(e.CreatedAt),
		ChatID:      e.ChatID,
		MessageID:   e.MessageID,
		Error:       e.Error,
	}
	if strings.TrimSpace(e.Meta) != "" && e.Meta != "{}" {
		var meta any
		if err := json.Unmarshal([]byte(e.Meta), &meta); err == nil {
			event.Meta = meta
		}
	}
	return event
}

func (s *Server) recordMCPAudit(ctx context.Context, connector mcpConnectorRecord, action string, chatID, messageID *string, success bool, errMsg *string, meta any) {
	metaJSON := "{}"
	if meta != nil {
		if raw, err := json.Marshal(meta); err == nil {
			metaJSON = string(raw)
		}
	}
	id := uuid.NewString()
	err := s.store.InsertMCPAuditEvent(ctx, repository.InsertMCPAuditEventParams{
		ID:          id,
		FamilyID:    connector.FamilyID,
		ConnectorID: connector.ID,
		ActorUserID: connector.ActorUserID,
		Action:      action,
		ChatID:      chatID,
		MessageID:   messageID,
		Success:     success,
		Error:       errMsg,
		Meta:        metaJSON,
		CreatedAt:   nowString(),
	})
	if err != nil {
		s.logger.Warnf("mcp", "audit write failed connector=%s action=%s error=%v", connector.ID, action, err)
	}
	if success {
		s.logger.Infof("mcp", "connector action connector=%s action=%s chat=%v message=%v", connector.ID, action, chatID, messageID)
	} else {
		detail := ""
		if errMsg != nil {
			detail = *errMsg
		}
		s.logger.Warnf("mcp", "connector action denied connector=%s action=%s detail=%s", connector.ID, action, detail)
	}
}

func (s *Server) listMCPAuditEvents(familyID, connectorID string, limit int) ([]mcpAuditEventPublic, error) {
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := s.store.ListMCPAuditEvents(context.Background(), familyID, connectorID, limit)
	if err != nil {
		return nil, err
	}
	events := make([]mcpAuditEventPublic, 0, len(rows))
	for _, row := range rows {
		events = append(events, mcpAuditEventFromEnt(row))
	}
	return events, nil
}
