// Package fileuploads provides SQL read adapters for direct file uploads.
package fileuploads

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	featurefiles "stovo-messenger/backend/internal/features/files"
)

type Reader struct{ db *sql.DB }

func NewReader(db *sql.DB) *Reader { return &Reader{db: db} }

func (r *Reader) FindByIdempotency(ctx context.Context, userID, key string) (featurefiles.DirectUpload, bool, error) {
	upload, err := scan(r.db.QueryRowContext(ctx, `SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at FROM file_uploads WHERE uploaded_by = $1 AND idempotency_key = $2`, userID, key))
	if err == sql.ErrNoRows {
		return featurefiles.DirectUpload{}, false, nil
	}
	return upload, err == nil, err
}

func (r *Reader) FindByID(ctx context.Context, uploadID, userID string) (featurefiles.DirectUpload, bool, error) {
	upload, err := scan(r.db.QueryRowContext(ctx, `SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at FROM file_uploads WHERE id = $1 AND uploaded_by = $2`, uploadID, userID))
	if err == sql.ErrNoRows {
		return featurefiles.DirectUpload{}, false, nil
	}
	return upload, err == nil, err
}

func (r *Reader) RequestHash(ctx context.Context, uploadID string) (string, error) {
	var hash string
	err := r.db.QueryRowContext(ctx, `SELECT request_hash FROM file_uploads WHERE id = $1`, uploadID).Scan(&hash)
	return hash, err
}

func (r *Reader) Complete(ctx context.Context, input featurefiles.CompleteUploadInput) (featurefiles.DirectUpload, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return featurefiles.DirectUpload{}, false, err
	}
	defer tx.Rollback()
	upload, err := scan(tx.QueryRowContext(ctx, `SELECT id, file_id, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at FROM file_uploads WHERE id = $1 AND uploaded_by = $2 FOR UPDATE`, input.UploadID, input.UserID))
	if err == sql.ErrNoRows {
		return featurefiles.DirectUpload{}, false, nil
	}
	if err != nil {
		return featurefiles.DirectUpload{}, false, err
	}
	next, accepted := featurefiles.UploadCompletionState(upload.State, upload.ExpiresAt, input.Now)
	if !accepted {
		return upload, false, nil
	}
	if next == "validating" && upload.State == "reserved" {
		now := input.Now.UTC().Format(time.RFC3339Nano)
		if _, err = tx.ExecContext(ctx, `UPDATE file_uploads SET state = 'validating', completed_at = $2, updated_at = $2 WHERE id = $1`, upload.UploadID, now); err != nil {
			return featurefiles.DirectUpload{}, false, err
		}
		if _, err = tx.ExecContext(ctx, `UPDATE files SET lifecycle_state = 'validating', object_etag = $2 WHERE id = $1`, upload.FileID, input.ObjectETag); err != nil {
			return featurefiles.DirectUpload{}, false, err
		}
		payload, marshalErr := json.Marshal(map[string]string{"uploadId": upload.UploadID, "fileId": upload.FileID})
		if marshalErr != nil {
			return featurefiles.DirectUpload{}, false, marshalErr
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload) VALUES ($1, '', $2, 'file.validate', 1, $3, $4::jsonb)`, uuid.NewString(), input.FamilyID, upload.FileID, payload); err != nil {
			return featurefiles.DirectUpload{}, false, err
		}
		upload.State = "validating"
	}
	if err = tx.Commit(); err != nil {
		return featurefiles.DirectUpload{}, false, err
	}
	return upload, true, nil
}

func (r *Reader) Reserve(ctx context.Context, input featurefiles.ReserveUploadInput) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	created := input.CreatedAt.UTC().Format(time.RFC3339Nano)
	_, err = tx.ExecContext(ctx, `INSERT INTO files (id, family_id, uploaded_by, chat_id, access_scope, storage_provider, object_key, lifecycle_state, object_revision, original_name, mime_type, size_bytes, checksum, created_at, preview_status) VALUES ($1,$2,$3,$4,$5,$6,$7,'reserved',$8,$9,$10,$11,$12,$13,'none')`, input.Upload.FileID, input.FamilyID, input.UserID, input.ChatID, input.AccessScope, input.StorageProvider, input.Upload.ObjectKey, input.Upload.FileID, input.OriginalName, input.Upload.ExpectedMIME, input.Upload.ExpectedBytes, input.Checksum, created)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO file_uploads (id, file_id, family_id, uploaded_by, chat_id, access_scope, idempotency_key, request_hash, upload_mode, object_key, expected_mime_type, expected_size_bytes, expected_checksum, state, expires_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'single',$9,$10,$11,$12,'reserved',$13,$14,$14)`, input.Upload.UploadID, input.Upload.FileID, input.FamilyID, input.UserID, input.ChatID, input.AccessScope, input.IdempotencyKey, input.RequestHash, input.Upload.ObjectKey, input.Upload.ExpectedMIME, input.Upload.ExpectedBytes, input.Checksum, input.Upload.ExpiresAt.UTC().Format(time.RFC3339Nano), created)
	if err != nil {
		return err
	}
	return tx.Commit()
}

// RecordLegacyUpload records the multipart upload's metadata and publishes its
// recipient-scoped file.changed event in the same Postgres transaction.
func (r *Reader) RecordLegacyUpload(ctx context.Context, upload featurefiles.LegacyUpload) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	created := upload.CreatedAt.UTC().Format(time.RFC3339Nano)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO files (id, family_id, uploaded_by, chat_id, access_scope, storage_provider, object_key,
		                   thumbnail_object_key, original_name, mime_type, size_bytes, checksum, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		upload.FileID, upload.FamilyID, upload.UserID, upload.ChatID, upload.AccessScope, upload.StorageProvider,
		upload.ObjectKey, upload.ThumbnailObjectKey, upload.OriginalName, upload.MIMEType, upload.SizeBytes,
		upload.Checksum, created); err != nil {
		return err
	}
	recipients, err := fileRecipients(ctx, tx, upload.FamilyID, upload.ChatID)
	if err != nil {
		return err
	}
	payload, err := json.Marshal(map[string]string{"fileId": upload.FileID})
	if err != nil {
		return err
	}
	eventID := uuid.NewString()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO sync_events (id, family_id, audience, event_type, schema_version, aggregate_type, aggregate_id, payload)
		VALUES ($1, $2, 'recipients', 'file.changed', 1, 'file', $3, $4::jsonb)`, eventID, upload.FamilyID, upload.FileID, payload); err != nil {
		return err
	}
	seen := make(map[string]struct{}, len(recipients))
	for _, userID := range recipients {
		if _, duplicate := seen[userID]; duplicate {
			continue
		}
		seen[userID] = struct{}{}
		if _, err := tx.ExecContext(ctx, `INSERT INTO sync_event_recipients (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING`, eventID, userID); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO outbox_events (id, sync_event_id, family_id, topic, schema_version, partition_key, payload)
		VALUES ($1, $2, $3, 'file.changed', 1, $4, $5::jsonb)`, uuid.NewString(), eventID, upload.FamilyID, upload.FileID, payload); err != nil {
		return err
	}
	return tx.Commit()
}

func fileRecipients(ctx context.Context, tx *sql.Tx, familyID string, chatID *string) ([]string, error) {
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
	defer rows.Close()
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

func scan(row *sql.Row) (featurefiles.DirectUpload, error) {
	var upload featurefiles.DirectUpload
	var expires string
	err := row.Scan(&upload.UploadID, &upload.FileID, &upload.ObjectKey, &upload.ExpectedMIME, &upload.ExpectedBytes, &upload.ExpectedSHA256, &upload.State, &expires)
	if err != nil {
		return featurefiles.DirectUpload{}, err
	}
	upload.ExpiresAt, err = time.Parse(time.RFC3339Nano, expires)
	return upload, err
}
