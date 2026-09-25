// Package outbox contains the infrastructure adapters used by the process
// outbox dispatcher. It deliberately owns database/sql so runtime can remain
// independent of the persistence implementation.
package outbox

import (
	"context"
	"database/sql"
	"time"

	"github.com/google/uuid"
	workruntime "stovo-messenger/backend/internal/runtime"
)

// PostgresStore leases and completes authoritative outbox rows. Leasing uses
// SKIP LOCKED so independent server instances can make progress concurrently.
type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) Lease(ctx context.Context, batch int, lease time.Duration) ([]workruntime.OutboxEvent, error) {
	owner := uuid.NewString()
	rows, err := s.db.QueryContext(ctx, `
		WITH candidates AS (
			SELECT id FROM outbox_events
			WHERE published_at IS NULL AND available_at <= now()
			  AND (lease_expires_at IS NULL OR lease_expires_at < now())
			ORDER BY created_at ASC
			LIMIT $1 FOR UPDATE SKIP LOCKED
		)
		UPDATE outbox_events e
		SET lease_owner = $2, lease_expires_at = now() + $3::interval, attempts = attempts + 1
		FROM candidates
		WHERE e.id = candidates.id
		RETURNING e.id, e.topic, e.schema_version, e.partition_key, e.payload`,
		batch, owner, lease.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	events := make([]workruntime.OutboxEvent, 0, batch)
	for rows.Next() {
		var event workruntime.OutboxEvent
		if err := rows.Scan(&event.ID, &event.Topic, &event.SchemaVersion, &event.PartitionKey, &event.Payload); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func (s *PostgresStore) MarkPublished(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE outbox_events
		SET published_at = now(), lease_owner = NULL, lease_expires_at = NULL, last_error = NULL
		WHERE id = $1`, id)
	return err
}
