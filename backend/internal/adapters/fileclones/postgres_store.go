package fileclones

import (
	"context"
	"database/sql"

	featurefiles "stovo-messenger/backend/internal/features/files"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) CreateClones(ctx context.Context, clones []featurefiles.CloneMetadata) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, clone := range clones {
		if _, err := tx.ExecContext(ctx, `INSERT INTO files (id,family_id,uploaded_by,chat_id,access_scope,storage_provider,object_key,thumbnail_object_key,original_name,mime_type,size_bytes,checksum,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, clone.ID, clone.FamilyID, clone.UploadedBy, clone.ChatID, clone.AccessScope, clone.StorageProvider, clone.ObjectKey, clone.ThumbnailObjectKey, clone.OriginalName, clone.MimeType, clone.SizeBytes, clone.Checksum, clone.CreatedAt); err != nil {
			return err
		}
	}
	return tx.Commit()
}
func (s *PostgresStore) DeleteClone(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM files WHERE id=$1`, id)
	return err
}
