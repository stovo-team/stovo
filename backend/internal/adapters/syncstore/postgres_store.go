// Package syncstore is the Postgres adapter for the sync feature's read port.
package syncstore

import (
	"context"
	"database/sql"

	featuresync "stovo-messenger/backend/internal/features/sync"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) List(ctx context.Context, actor featuresync.Actor, after int64, limit int) ([]featuresync.Event, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT e.sequence, e.id, e.event_type, e.schema_version,
		       e.aggregate_type, e.aggregate_id, e.payload, e.occurred_at
		FROM sync_events e
		WHERE e.family_id = $1 AND e.sequence > $2
		  AND (e.audience = 'family' OR EXISTS (
			SELECT 1 FROM sync_event_recipients r WHERE r.event_id = e.id AND r.user_id = $3
		  ))
		ORDER BY e.sequence ASC LIMIT $4`, actor.FamilyID, after, actor.UserID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]featuresync.Event, 0, limit)
	for rows.Next() {
		var event featuresync.Event
		if err := rows.Scan(&event.Sequence, &event.ID, &event.Type, &event.Version, &event.AggregateType, &event.AggregateID, &event.Payload, &event.OccurredAt); err != nil {
			return nil, err
		}
		event.Payload = append([]byte(nil), event.Payload...)
		events = append(events, event)
	}
	return events, rows.Err()
}

func (s *PostgresStore) HighWater(ctx context.Context, familyID string) (int64, error) {
	var sequence int64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sequence), 0) FROM sync_events WHERE family_id = $1`, familyID).Scan(&sequence)
	return sequence, err
}
