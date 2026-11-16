package intelligencesourcev2

import (
	"context"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

type EventRecord struct {
	EventID, ResourceID, RevisionID, ContainerID, Kind, Origin, OperationID string
	Sequence                                                                int64
	ObservedAt                                                              time.Time
	Tombstone                                                               bool
}

func (s *Store) LoadEvents(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, backfillID string, after int64, limit int) ([]EventRecord, bool, error) {
	var backfillExists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_backfills WHERE id=$1 AND connection_id=$2 AND chat_id IS NOT DISTINCT FROM $3::text)`, backfillID, identity.ConnectionID, nullableChatScope(identity.ChatID)).Scan(&backfillExists); err != nil {
		return nil, false, err
	}
	if !backfillExists {
		return nil, false, ErrNotFound
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT e.event_id,e.resource_id,e.revision_id,e.sequence,e.chat_id,e.observed_at,e.kind,e.tombstone,
		       COALESCE(origin.origin,''),COALESCE(origin.operation_id,'')
		FROM public.intelligence_source_v2_events e
		LEFT JOIN public.intelligence_source_v2_reply_origins origin ON origin.message_id=e.resource_id AND origin.connection_id=e.connection_id
		JOIN public.intelligence_source_v2_connections c ON c.id=e.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.tenant_id=$2 AND i.family_id=$3
		JOIN public.chats event_chat ON event_chat.id=e.chat_id AND event_chat.family_id=i.family_id
		JOIN public.chat_members current_member ON current_member.chat_id=event_chat.id AND current_member.user_id=c.principal_user_id
		WHERE e.connection_id=$1 AND (($4::text IS NOT NULL AND e.chat_id=$4) OR ($4::text IS NULL AND c.scope_kind='space' AND c.scope_family_id=event_chat.family_id)) AND e.sequence>$5
		ORDER BY e.sequence ASC LIMIT $6`, identity.ConnectionID, identity.TenantID, identity.FamilyID, nullableChatScope(identity.ChatID), after, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = rows.Close() }()
	events := make([]EventRecord, 0, limit)
	for rows.Next() {
		var event EventRecord
		if err := rows.Scan(&event.EventID, &event.ResourceID, &event.RevisionID, &event.Sequence, &event.ContainerID, &event.ObservedAt, &event.Kind, &event.Tombstone, &event.Origin, &event.OperationID); err != nil {
			return nil, false, err
		}
		if len(events) == limit {
			break
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if err := rows.Close(); err != nil {
		return nil, false, err
	}
	if len(events) != limit {
		return events, false, nil
	}
	var hasMore bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_events e JOIN public.intelligence_source_v2_connections c ON c.id=e.connection_id JOIN public.chats ch ON ch.id=e.chat_id JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=c.principal_user_id WHERE e.connection_id=$1 AND (($2::text IS NOT NULL AND e.chat_id=$2) OR ($2::text IS NULL AND c.scope_kind='space' AND c.scope_family_id=ch.family_id)) AND e.sequence>$3)`, identity.ConnectionID, nullableChatScope(identity.ChatID), events[len(events)-1].Sequence).Scan(&hasMore); err != nil {
		return nil, false, err
	}
	return events, hasMore, nil
}
