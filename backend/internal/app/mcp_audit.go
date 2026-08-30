package app

import (
	"context"
	"encoding/json"

	featuremcp "stovo-messenger/backend/internal/features/mcp"

	"github.com/google/uuid"
)

func mcpAuditEventFromFeature(e featuremcp.AuditEvent) mcpAuditEventPublic {
	event := mcpAuditEventPublic{
		ID:          e.ID,
		ConnectorID: e.ConnectorID,
		ActorUserID: e.ActorUserID,
		Action:      e.Action,
		Success:     e.Success,
		CreatedAt:   e.CreatedAt,
		ChatID:      e.ChatID,
		MessageID:   e.MessageID,
		Error:       e.Error,
	}
	if len(e.Meta) != 0 && string(e.Meta) != "{}" {
		var meta any
		if err := json.Unmarshal(e.Meta, &meta); err == nil {
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
	err := s.mcpAudit.Record(ctx, featuremcp.AuditRecord{ID: id, FamilyID: connector.FamilyID, ConnectorID: connector.ID, ActorUserID: connector.ActorUserID, Action: action, ChatID: chatID, MessageID: messageID, Success: success, Error: errMsg, Meta: json.RawMessage(metaJSON), CreatedAt: nowString()})
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
	rows, err := s.mcpAudit.List(context.Background(), familyID, connectorID, limit)
	if err != nil {
		return nil, err
	}
	events := make([]mcpAuditEventPublic, 0, len(rows))
	for _, row := range rows {
		events = append(events, mcpAuditEventFromFeature(row))
	}
	return events, nil
}
