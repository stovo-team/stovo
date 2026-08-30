// Package familyprofiles implements family profile persistence for the
// family feature using Postgres.
package familyprofiles

import (
	"context"
	"database/sql"

	featurefamily "stovo-messenger/backend/internal/features/family"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) UpdateProfile(ctx context.Context, familyID string, patch featurefamily.ProfilePatch) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE families
		SET name = COALESCE($1, name), storage_limit_mb = COALESCE($2, storage_limit_mb),
		    minimized_chat_layout = COALESCE($3, minimized_chat_layout), updated_at = $4
		WHERE id = $5`, patch.Name, patch.StorageLimitMB, patch.MinimizedChatLayout, patch.UpdatedAt, familyID)
	return err
}
