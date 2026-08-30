// Package publicaccess implements administration ports with Postgres.
package publicaccess

import (
	"context"
	"database/sql"

	"stovo-messenger/backend/internal/features/administration"
)

type PostgresStore struct{ db *sql.DB }

func NewPostgresStore(db *sql.DB) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) SavePublicURLs(ctx context.Context, familyID string, urls administration.PublicURLs) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE families SET public_app_url = $1, public_api_url = $2, updated_at = now()
		WHERE id = $3`, urls.AppURL, urls.APIURL, familyID)
	return err
}
