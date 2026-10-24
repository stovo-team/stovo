package intelligencesourcev2

import (
	"context"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

type EventRecord struct {
	EventID, ResourceID, RevisionID, ContainerID, Kind string
	Sequence                                           int64
	ObservedAt                                         time.Time
	Tombstone                                          bool
}

func (s *Store) LoadEvents(ctx context.Context, identity httptransport.IntelligenceSourceIdentity, backfillID string, after int64, limit int) ([]EventRecord, bool, error) {
	var backfillExists bool
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_backfills WHERE id=$1 AND connection_id=$2 AND chat_id=$3)`, backfillID, identity.ConnectionID, identity.ChatID).Scan(&backfillExists); err != nil {
		return nil, false, err
	}
	if !backfillExists {
		return nil, false, ErrNotFound
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT e.event_id,e.resource_id,e.revision_id,e.sequence,e.chat_id,e.observed_at,e.kind,e.tombstone
		FROM public.intelligence_source_v2_events e
		JOIN public.intelligence_source_v2_connections c ON c.id=e.connection_id AND c.id=$1 AND c.enabled AND c.revoked_at IS NULL
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled AND i.tenant_id=$2 AND i.family_id=$3
		WHERE e.connection_id=$1 AND e.chat_id=$4 AND e.sequence>$5
		ORDER BY e.sequence ASC LIMIT $6`, identity.ConnectionID, identity.TenantID, identity.FamilyID, identity.ChatID, after, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = rows.Close() }()
	events := make([]EventRecord, 0, limit)
	for rows.Next() {
		var event EventRecord
		if err := rows.Scan(&event.EventID, &event.ResourceID, &event.RevisionID, &event.Sequence, &event.ContainerID, &event.ObservedAt, &event.Kind, &event.Tombstone); err != nil {
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
	if err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM public.intelligence_source_v2_events WHERE connection_id=$1 AND chat_id=$2 AND sequence>$3)`, identity.ConnectionID, identity.ChatID, events[len(events)-1].Sequence).Scan(&hasMore); err != nil {
		return nil, false, err
	}
	return events, hasMore, nil
}
