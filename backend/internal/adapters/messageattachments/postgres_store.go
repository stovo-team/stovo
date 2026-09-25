// Package messageattachments persists message attachment finalization for the
// messages feature. The attachment rows and durable sync event share one SQL
// transaction so other devices never observe a partial mutation.
package messageattachments

import (
	"context"
	"database/sql"
	"encoding/json"

	featuremessages "stovo-messenger/backend/internal/features/messages"

	"github.com/google/uuid"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Attach(ctx context.Context, command featuremessages.AttachmentCommand) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, fileID := range command.FileIDs {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO message_attachments (message_id, file_id) VALUES ($1, $2)
			ON CONFLICT (message_id, file_id) DO NOTHING`, command.MessageID, fileID); err != nil {
			return err
		}
	}
	if err := writeChangedEvent(ctx, tx, command); err != nil {
		return err
	}
	return tx.Commit()
}

func writeChangedEvent(ctx context.Context, tx *sql.Tx, command featuremessages.AttachmentCommand) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT cm.user_id FROM chat_members cm
		JOIN users u ON u.id = cm.user_id
		WHERE cm.chat_id = $1 AND u.is_active = 1`, command.ChatID)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	recipients := make([]string, 0)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		recipients = append(recipients, userID)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"messageId": command.MessageID, "chatId": command.ChatID})
	if err != nil {
		return err
	}
	eventID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_events (id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, 'recipients', 'message.changed', 1, 'message', $3, $4::jsonb)`,
		eventID, command.FamilyID, command.MessageID, payload); err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(recipients))
	for _, userID := range recipients {
		if _, duplicate := seen[userID]; duplicate || userID == "" {
			continue
		}
		seen[userID] = struct{}{}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO sync_event_recipients (event_id, user_id) VALUES ($1, $2)
			ON CONFLICT (event_id, user_id) DO NOTHING`, eventID, userID); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload)
		VALUES ($1, $2, $3, 'message.changed', 1, $4, $5::jsonb)`,
		uuid.NewString(), eventID, command.FamilyID, command.ChatID, payload)
	return err
}
