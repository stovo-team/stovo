// Package filedeletions implements file metadata deletion and its durable
// recipient sync notification using Postgres.
package filedeletions

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	featurefiles "stovo-messenger/backend/internal/features/files"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

// Delete preserves the former file handler transaction: the soft deletion,
// recipient-scoped sync event, and outbox event either all commit or none do.
func (s *PostgresStore) Delete(ctx context.Context, deletion featurefiles.Deletion) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := tx.ExecContext(ctx, `UPDATE files SET deleted_at=$2 WHERE id=$1 AND deleted_at IS NULL`, deletion.FileID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if updated == 0 {
		return tx.Commit()
	}
	recipients, err := recipientIDs(ctx, tx, deletion.FamilyID, deletion.ChatID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"fileId": deletion.FileID})
	if err != nil {
		return err
	}
	eventID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_events (id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, 'recipients', 'file.deleted', 1, 'file', $3, $4::jsonb)`, eventID, deletion.FamilyID, deletion.FileID, payload); err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(recipients))
	for _, userID := range recipients {
		if _, duplicate := seen[userID]; duplicate {
			continue
		}
		seen[userID] = struct{}{}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_event_recipients (event_id, user_id) VALUES ($1, $2)
			ON CONFLICT (event_id, user_id) DO NOTHING`, eventID, userID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload)
		VALUES ($1, $2, $3, 'file.deleted', 1, $4, $5::jsonb)`, uuid.NewString(), eventID, deletion.FamilyID, deletion.FileID, payload); err != nil {
		return err
	}
	return tx.Commit()
}

func recipientIDs(ctx context.Context, tx *sql.Tx, familyID string, chatID *string) ([]string, error) {
	query := `SELECT id FROM users WHERE family_id=$1 AND is_active=1`
	args := []any{familyID}
	if chatID != nil && strings.TrimSpace(*chatID) != "" {
		query = `SELECT cm.user_id FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=$1 AND u.is_active=1`
		args = []any{*chatID}
	}
	rows, err := tx.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var recipients []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		recipients = append(recipients, userID)
	}
	return recipients, rows.Err()
}
