// Package filepreferences implements private file preferences and their
// durable sync notification as one Postgres transaction.
package filepreferences

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/google/uuid"
	featurefiles "stovo-messenger/backend/internal/features/files"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) SetFavorite(ctx context.Context, change featurefiles.FavoriteChange) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO file_preferences (file_id, user_id, is_favorite) VALUES ($1, $2, $3)
		ON CONFLICT (file_id, user_id) DO UPDATE SET is_favorite=EXCLUDED.is_favorite`, change.FileID, change.UserID, change.IsFavorite); err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"fileId": change.FileID})
	if err != nil {
		return err
	}
	eventID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_events (id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, 'recipients', 'file.preference.changed', 1, 'file', $3, $4::jsonb)`, eventID, change.FamilyID, change.FileID, payload); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO sync_event_recipients (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, eventID, change.UserID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload)
		VALUES ($1, $2, $3, 'file.preference.changed', 1, $4, $5::jsonb)`, uuid.NewString(), eventID, change.FamilyID, change.FileID, payload)
	if err != nil {
		return err
	}
	return tx.Commit()
}
