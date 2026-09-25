// Package filevalidation implements direct-upload validation state changes in
// Postgres, including durable recipient sync/outbox publication.
package filevalidation

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/google/uuid"
	featurefiles "stovo-messenger/backend/internal/features/files"
	"strings"
)

const consumerName = "file-validation"

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Lifecycle(ctx context.Context, fileID string) (featurefiles.Lifecycle, error) {
	var lifecycle featurefiles.Lifecycle
	var revision sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT lifecycle_state, object_revision FROM files WHERE id = $1`, fileID).Scan(&lifecycle.State, &revision)
	if revision.Valid {
		value := revision.String
		lifecycle.ObjectRevision = &value
	}
	return lifecycle, err
}
func (s *PostgresStore) ReceiptRecorded(ctx context.Context, eventID string) (bool, error) {
	if eventID == "" {
		return false, nil
	}
	var exists bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM consumer_receipts WHERE consumer_name = $1 AND event_id = $2)`, consumerName, eventID).Scan(&exists)
	return exists, err
}
func (s *PostgresStore) LoadValidationUpload(ctx context.Context, uploadID string) (featurefiles.ValidationUpload, bool, error) {
	var upload featurefiles.ValidationUpload
	var checksum, chat sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT fu.file_id, fu.object_key, fu.expected_mime_type, fu.expected_size_bytes, fu.expected_checksum, fu.state, f.family_id, f.chat_id FROM file_uploads fu JOIN files f ON f.id=fu.file_id WHERE fu.id = $1`, uploadID).Scan(&upload.FileID, &upload.ObjectKey, &upload.ExpectedMIME, &upload.ExpectedBytes, &checksum, &upload.State, &upload.FamilyID, &chat)
	if err == sql.ErrNoRows {
		return featurefiles.ValidationUpload{}, false, nil
	}
	if err != nil {
		return featurefiles.ValidationUpload{}, false, err
	}
	upload.UploadID = uploadID
	if checksum.Valid {
		value := checksum.String
		upload.ExpectedChecksum = &value
	}
	if chat.Valid {
		value := chat.String
		upload.ChatID = &value
	}
	return upload, true, nil
}
func (s *PostgresStore) MarkValidationReady(ctx context.Context, ready featurefiles.ValidationReady) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	upload := ready.Upload
	if _, err = tx.ExecContext(ctx, `UPDATE file_uploads SET state = 'ready', updated_at = $2, failure_code = NULL WHERE id = $1`, upload.UploadID, ready.ValidatedAt); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE files SET lifecycle_state = 'ready', object_revision = $2, detected_mime_type = $3, checksum = $4, validated_at = $5, validation_failure_code = NULL WHERE id = $1`, upload.FileID, uuid.NewString(), ready.DetectedMIME, ready.Checksum, ready.ValidatedAt); err != nil {
		return err
	}
	if err = writeFileEvent(ctx, tx, upload.FamilyID, upload.ChatID, "file.changed", upload.FileID); err != nil {
		return err
	}
	if ready.EventID != "" {
		if _, err = tx.ExecContext(ctx, `INSERT INTO consumer_receipts (consumer_name, event_id, result) VALUES ($1, $2, '{"status":"processed"}'::jsonb) ON CONFLICT (consumer_name, event_id) DO NOTHING`, consumerName, ready.EventID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *PostgresStore) RejectValidation(ctx context.Context, rejection featurefiles.ValidationRejected) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE file_uploads SET state = 'rejected', failure_code = $2, updated_at = $3 WHERE id = $1`, rejection.UploadID, rejection.FailureCode, rejection.ValidatedAt); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `UPDATE files SET lifecycle_state = 'rejected', validation_failure_code = $2, detected_mime_type = $3, validated_at = $4 WHERE id = $1`, rejection.FileID, rejection.FailureCode, rejection.DetectedMIME, rejection.ValidatedAt)
	return err
}
func (s *PostgresStore) RecordValidationReceipt(ctx context.Context, eventID string) error {
	if eventID == "" {
		return nil
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO consumer_receipts (consumer_name, event_id, result) VALUES ($1, $2, '{"status":"processed"}'::jsonb) ON CONFLICT (consumer_name, event_id) DO NOTHING`, consumerName, eventID)
	return err
}
func writeFileEvent(ctx context.Context, tx *sql.Tx, familyID string, chatID *string, eventType, fileID string) error {
	recipients, err := recipientsForChat(ctx, tx, familyID, chatID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"fileId": fileID})
	if err != nil {
		return err
	}
	eventID := uuid.NewString()
	if _, err = tx.ExecContext(ctx, `INSERT INTO sync_events (id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload) VALUES ($1,$2,'recipients',$3,1,'file',$4,$5::jsonb)`, eventID, familyID, eventType, fileID, payload); err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, id := range recipients {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if _, err = tx.ExecContext(ctx, `INSERT INTO sync_event_recipients (event_id,user_id) VALUES ($1,$2) ON CONFLICT (event_id,user_id) DO NOTHING`, eventID, id); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO outbox_events (id,sync_event_id,family_id,topic,schema_version,partition_key,payload) VALUES ($1,$2,$3,$4,1,$5,$6::jsonb)`, uuid.NewString(), eventID, familyID, eventType, fileID, payload)
	return err
}
func recipientsForChat(ctx context.Context, tx *sql.Tx, familyID string, chatID *string) ([]string, error) {
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
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
